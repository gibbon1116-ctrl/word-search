import { JA } from "../i18n/ja";

export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".xlsx",
  ".xlsm",
  ".xls",
  ".docx",
  ".html",
  ".htm",
  ".json",
];

export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.join(",");

export function getFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

export function getReadableFileType(fileName: string, mimeType = ""): string {
  const ext = getFileExtension(fileName);
  if (ext === ".pdf" || mimeType.includes("pdf")) return JA.fileTypes.pdf;
  if (ext === ".txt" || mimeType.startsWith("text/plain")) return JA.fileTypes.text;
  if (ext === ".md" || ext === ".markdown") return JA.fileTypes.markdown;
  if (ext === ".csv" || mimeType.includes("csv")) return JA.fileTypes.csv;
  if (ext === ".tsv") return JA.fileTypes.tsv;
  if ([".xlsx", ".xlsm", ".xls"].includes(ext)) return JA.fileTypes.excel;
  if (ext === ".docx") return JA.fileTypes.wordDocx;
  if ([".html", ".htm"].includes(ext) || mimeType.includes("html")) return JA.fileTypes.html;
  if (ext === ".json" || mimeType.includes("json")) return JA.fileTypes.json;
  return JA.fileTypes.unknown;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function isSupportedFile(file: File): boolean {
  return SUPPORTED_EXTENSIONS.includes(getFileExtension(file.name));
}
