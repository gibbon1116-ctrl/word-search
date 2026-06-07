import type { DocumentRecord } from "../../models/DocumentRecord";
import type { ExtractedChunk } from "../../models/ExtractedChunk";

export type DocumentExportFormat = "markdown" | "text" | "json" | "csv";

interface ExportChunkRecord {
  documentId: string;
  fileName: string;
  fileType: string;
  importedAt: string;
  exportedAt: string;
  chunkCount: number;
  chunkIndex: number;
  pageNumber?: number;
  sheetName?: string;
  rowNumber?: number;
  heading?: string;
  ocrUsed: boolean;
  ocrConfidence?: number;
  ocrPreprocessMode?: string;
  text: string;
  originalOcrText: string;
  correctedSearchText: string;
  displayText: string;
  exportText: string;
}

export function exportDocumentAsMarkdown(document: DocumentRecord, chunks: ExtractedChunk[]): string {
  const exportedAt = new Date().toISOString();
  const records = createExportRecords(document, chunks, exportedAt);
  const metadata = createDocumentMetadata(document, records, exportedAt);
  const lines = [
    `# ${document.fileName}`,
    "",
    "## Export metadata",
    "",
    `- fileName: ${document.fileName}`,
    `- documentId: ${document.documentId}`,
    `- fileType: ${document.fileType}`,
    `- importedAt: ${document.importedAt}`,
    `- exportedAt: ${exportedAt}`,
    `- chunkCount: ${chunks.length}`,
    `- ocrUsed: ${metadata.ocrUsed}`,
    metadata.minOcrConfidence === undefined ? undefined : `- minOcrConfidence: ${Math.round(metadata.minOcrConfidence)}%`,
    metadata.maxOcrConfidence === undefined ? undefined : `- maxOcrConfidence: ${Math.round(metadata.maxOcrConfidence)}%`,
    `- ocrPreprocessModes: ${metadata.ocrPreprocessModes.join(", ") || "-"}`,
    "",
    "## Body",
    "",
  ].filter((line): line is string => line !== undefined);

  for (const record of records) {
    lines.push(`### ${createChunkTitle(record)}`, "");
    lines.push(`- chunkIndex: ${record.chunkIndex}`);
    if (record.pageNumber !== undefined) lines.push(`- pageNumber: ${record.pageNumber}`);
    if (record.sheetName) lines.push(`- sheetName: ${record.sheetName}`);
    if (record.rowNumber !== undefined) lines.push(`- rowNumber: ${record.rowNumber}`);
    if (record.heading) lines.push(`- heading: ${record.heading}`);
    lines.push(`- ocrUsed: ${record.ocrUsed}`);
    if (record.ocrConfidence !== undefined) lines.push(`- ocrConfidence: ${Math.round(record.ocrConfidence)}%`);
    if (record.ocrPreprocessMode) lines.push(`- ocrPreprocessMode: ${record.ocrPreprocessMode}`);
    lines.push("", record.exportText || "", "");
  }

  return lines.join("\n");
}

export function exportDocumentAsText(document: DocumentRecord, chunks: ExtractedChunk[]): string {
  const exportedAt = new Date().toISOString();
  const records = createExportRecords(document, chunks, exportedAt);
  const metadata = createDocumentMetadata(document, records, exportedAt);
  const lines = [
    `fileName: ${document.fileName}`,
    `documentId: ${document.documentId}`,
    `fileType: ${document.fileType}`,
    `importedAt: ${document.importedAt}`,
    `exportedAt: ${exportedAt}`,
    `chunkCount: ${chunks.length}`,
    `ocrUsed: ${metadata.ocrUsed}`,
    metadata.minOcrConfidence === undefined ? undefined : `minOcrConfidence: ${Math.round(metadata.minOcrConfidence)}%`,
    metadata.maxOcrConfidence === undefined ? undefined : `maxOcrConfidence: ${Math.round(metadata.maxOcrConfidence)}%`,
    `ocrPreprocessModes: ${metadata.ocrPreprocessModes.join(", ") || "-"}`,
    "",
  ].filter((line): line is string => line !== undefined);

  for (const record of records) {
    lines.push(`----- ${createChunkTitle(record)} -----`);
    if (record.pageNumber !== undefined) lines.push(`pageNumber: ${record.pageNumber}`);
    if (record.sheetName) lines.push(`sheetName: ${record.sheetName}`);
    if (record.rowNumber !== undefined) lines.push(`rowNumber: ${record.rowNumber}`);
    if (record.heading) lines.push(`heading: ${record.heading}`);
    if (record.ocrConfidence !== undefined) lines.push(`ocrConfidence: ${Math.round(record.ocrConfidence)}%`);
    if (record.ocrPreprocessMode) lines.push(`ocrPreprocessMode: ${record.ocrPreprocessMode}`);
    lines.push("", record.exportText || "", "");
  }

  return lines.join("\n");
}

export function exportDocumentAsJson(document: DocumentRecord, chunks: ExtractedChunk[]): string {
  const exportedAt = new Date().toISOString();
  const records = createExportRecords(document, chunks, exportedAt);
  return JSON.stringify(
    {
      ...createDocumentMetadata(document, records, exportedAt),
      chunks: records,
    },
    null,
    2,
  );
}

export function exportDocumentAsCsv(document: DocumentRecord, chunks: ExtractedChunk[]): string {
  const exportedAt = new Date().toISOString();
  const records = createExportRecords(document, chunks, exportedAt);
  const header = [
    "fileName",
    "documentId",
    "chunkIndex",
    "pageNumber",
    "sheetName",
    "rowNumber",
    "heading",
    "ocrUsed",
    "ocrConfidence",
    "ocrPreprocessMode",
    "text",
    "originalOcrText",
    "correctedSearchText",
  ];
  const rows = records.map((record) =>
    [
      record.fileName,
      record.documentId,
      record.chunkIndex,
      record.pageNumber ?? "",
      record.sheetName ?? "",
      record.rowNumber ?? "",
      record.heading ?? "",
      record.ocrUsed,
      record.ocrConfidence ?? "",
      record.ocrPreprocessMode ?? "",
      record.text,
      record.originalOcrText,
      record.correctedSearchText,
    ].map(escapeCsvCell).join(","),
  );
  return `\uFEFF${[header.join(","), ...rows].join("\r\n")}`;
}

export function downloadBlob(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createExportFileName(document: DocumentRecord, extension: string): string {
  const baseName = document.fileName.replace(/\.[^.]+$/, "");
  const safeName = baseName.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "document";
  return `${safeName}_ocr_export.${extension}`;
}

function createExportRecords(document: DocumentRecord, chunks: ExtractedChunk[], exportedAt: string): ExportChunkRecord[] {
  return chunks.map((chunk) => {
    const originalOcrText = getStringMetadata(chunk, "originalOcrText");
    const correctedSearchText = getStringMetadata(chunk, "correctedSearchText");
    const displayText = correctedSearchText || originalOcrText || chunk.text;
    return {
      documentId: document.documentId,
      fileName: document.fileName,
      fileType: document.fileType,
      importedAt: document.importedAt,
      exportedAt,
      chunkCount: chunks.length,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      sheetName: chunk.sheetName,
      rowNumber: chunk.rowNumber,
      heading: chunk.heading,
      ocrUsed: chunk.metadata.ocrUsed === true,
      ocrConfidence: getNumberMetadata(chunk, "ocrConfidence"),
      ocrPreprocessMode: getStringMetadata(chunk, "ocrPreprocessMode") || undefined,
      text: chunk.text,
      originalOcrText,
      correctedSearchText,
      displayText,
      exportText: displayText,
    };
  });
}

function createDocumentMetadata(document: DocumentRecord, records: ExportChunkRecord[], exportedAt: string) {
  const confidences = records.map((record) => record.ocrConfidence).filter((value): value is number => value !== undefined);
  return {
    fileName: document.fileName,
    documentId: document.documentId,
    fileType: document.fileType,
    importedAt: document.importedAt,
    exportedAt,
    chunkCount: records.length,
    ocrUsed: records.some((record) => record.ocrUsed),
    minOcrConfidence: confidences.length ? Math.min(...confidences) : undefined,
    maxOcrConfidence: confidences.length ? Math.max(...confidences) : undefined,
    ocrPreprocessModes: Array.from(new Set(records.map((record) => record.ocrPreprocessMode).filter((value): value is string => Boolean(value)))),
  };
}

function createChunkTitle(record: ExportChunkRecord): string {
  const parts = [`Chunk ${record.chunkIndex + 1}`];
  if (record.pageNumber !== undefined) parts.push(`Page ${record.pageNumber}`);
  if (record.sheetName) parts.push(record.sheetName);
  if (record.rowNumber !== undefined) parts.push(`Row ${record.rowNumber}`);
  if (record.heading) parts.push(record.heading);
  return parts.join(" / ");
}

function getStringMetadata(chunk: ExtractedChunk, key: string): string {
  const value = chunk.metadata[key];
  return typeof value === "string" ? value : "";
}

function getNumberMetadata(chunk: ExtractedChunk, key: string): number | undefined {
  const value = chunk.metadata[key];
  return typeof value === "number" ? value : undefined;
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
