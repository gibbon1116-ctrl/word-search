import * as XLSX from "xlsx";
import type { ExtractedChunk } from "../../models/ExtractedChunk";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

type RawChunk = Omit<ExtractedChunk, "chunkIndex" | "startOffset" | "endOffset">;

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
    const rawChunks: RawChunk[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet["!ref"]) continue;
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      const tableRows: string[][] = [];
      const formulas: Record<string, string> = {};
      let hasDisplayValue = false;

      for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
        const rowCells: string[] = [];

        for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = sheet[address];
          const displayValue = cell ? XLSX.utils.format_cell(cell).trim() : "";
          if (displayValue) hasDisplayValue = true;
          rowCells.push(displayValue);
          if (cell?.f) {
            formulas[address] = cell.f;
          }
        }

        tableRows.push(rowCells);
      }

      if (!hasDisplayValue) continue;

      const cellRange = `${XLSX.utils.encode_cell(range.s)}:${XLSX.utils.encode_cell(range.e)}`;
      const columnLabels = createColumnLabels(range.s.c, range.e.c);
      const textRows = tableRows.map((row, rowOffset) => {
        const rowNumber = range.s.r + rowOffset + 1;
        return `${rowNumber}\t${row.join("\t")}`;
      });

      rawChunks.push({
        chunkId: createId("chunk"),
        documentId,
        chunkType: "excel-sheet",
        text: [`シート名: ${sheetName}`, `セル範囲: ${cellRange}`, ["行", ...columnLabels].join("\t"), ...textRows].join("\n"),
        sheetName,
        cellRange,
        metadata: {
          formulas,
          tableKind: "excel-sheet",
          tableRows,
          tableColumnLabels: columnLabels,
          tableStartRowNumber: range.s.r + 1,
        },
      });
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

function createColumnLabels(startColumn: number, endColumn: number): string[] {
  const labels: string[] = [];
  for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
    labels.push(XLSX.utils.encode_col(columnIndex));
  }
  return labels;
}
