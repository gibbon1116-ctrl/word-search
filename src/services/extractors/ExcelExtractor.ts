import * as XLSX from "xlsx";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

export class ExcelExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return [".xlsx", ".xlsm", ".xls"].includes(getFileExtension(file.name));
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      type: "array",
      cellDates: true,
      cellFormula: true,
    });
    const rawChunks = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");

      for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
        const rowCells: string[] = [];
        const formulas: Record<string, string> = {};
        let firstColumn = -1;
        let lastColumn = -1;

        for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = sheet[address];
          if (!cell) continue;
          const displayValue = XLSX.utils.format_cell(cell).trim();
          if (!displayValue) continue;
          if (firstColumn < 0) firstColumn = columnIndex;
          lastColumn = columnIndex;
          rowCells.push(`${address}: ${displayValue}`);
          if (cell.f) {
            formulas[address] = cell.f;
          }
        }

        if (!rowCells.length) continue;

        const rowNumber = rowIndex + 1;
        const cellRange =
          firstColumn >= 0 && lastColumn >= 0
            ? `${XLSX.utils.encode_cell({ r: rowIndex, c: firstColumn })}:${XLSX.utils.encode_cell({
                r: rowIndex,
                c: lastColumn,
              })}`
            : undefined;

        rawChunks.push({
          chunkId: createId("chunk"),
          documentId,
          chunkType: "excel-row" as const,
          text: `シート名: ${sheetName}\n行番号: ${rowNumber}\n${rowCells.join("\n")}`,
          sheetName,
          rowNumber,
          cellRange,
          metadata: { formulas },
        });
      }
    }

    const chunks = assignChunkPositions(rawChunks);

    if (!chunks.length) {
      throw new Error("Excelから検索できるセルの表示値を取得できませんでした。");
    }

    return {
      documentId,
      fileName: file.name,
      fileType: getReadableFileType(file.name, file.type),
      fileSize: file.size,
      importedAt: now,
      updatedAt: now,
      title: file.name,
      chunks,
      metadata: { sheetNames: workbook.SheetNames },
    };
  }
}
