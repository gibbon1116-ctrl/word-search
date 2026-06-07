import Papa from "papaparse";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

export class CsvExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    const ext = getFileExtension(file.name);
    return ext === ".csv" || ext === ".tsv" || file.type.includes("csv");
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const delimiter = getFileExtension(file.name) === ".tsv" ? "\t" : "";
    const parsed = await parseCsv(file, delimiter);
    const rows = parsed.data.filter((row) => row.some((cell) => String(cell ?? "").trim()));
    const header = shouldUseHeader(rows[0]) ? rows[0] : undefined;
    const dataRows = header ? rows.slice(1) : rows;

    const rawChunks = dataRows.map((row, index) => {
      const rowNumber = header ? index + 2 : index + 1;
      const text = row
        .map((cell, cellIndex) => {
          const value = String(cell ?? "").trim();
          const label = header?.[cellIndex]?.trim();
          return label ? `${label}: ${value}` : value;
        })
        .filter(Boolean)
        .join(" / ");
      return {
        chunkId: createId("chunk"),
        documentId,
        chunkType: "csv-row" as const,
        text,
        rowNumber,
        metadata: {
          delimiter: parsed.meta.delimiter,
          parseErrors: parsed.errors.map((error) => error.message),
        },
      };
    });
    const chunks = assignChunkPositions(rawChunks);

    return {
      documentId,
      fileName: file.name,
      fileType: getReadableFileType(file.name, file.type),
      fileSize: file.size,
      importedAt: now,
      updatedAt: now,
      title: file.name,
      chunks,
      metadata: {
        rowCount: rows.length,
        hasHeader: Boolean(header),
        delimiter: parsed.meta.delimiter,
        parseErrors: parsed.errors.map((error) => error.message),
      },
    };
  }
}

function parseCsv(file: File, delimiter: string): Promise<Papa.ParseResult<string[]>> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      delimiter,
      skipEmptyLines: "greedy",
      worker: true,
      complete: resolve,
      error: (error) => reject(new Error(`CSV/TSVの読み込みに失敗しました: ${error.message}`)),
    });
  });
}

function shouldUseHeader(row?: string[]): row is string[] {
  if (!row || row.length < 2) return false;
  const values = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
  const unique = new Set(values);
  const textLike = values.filter((value) => Number.isNaN(Number(value))).length;
  return values.length >= 2 && unique.size === values.length && textLike >= Math.ceil(values.length / 2);
}
