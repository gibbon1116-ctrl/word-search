import type { ExtractedDocument } from "../../models/ExtractedDocument";

export interface DocumentExtractor {
  canHandle(file: File): boolean;
  extract(file: File): Promise<ExtractedDocument>;
}

export type SupportedFileType =
  | "pdf"
  | "txt"
  | "markdown"
  | "csv"
  | "tsv"
  | "excel"
  | "word"
  | "html"
  | "json";
