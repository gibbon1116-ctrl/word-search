import type { ExtractedDocument } from "../../models/ExtractedDocument";

export interface DocumentExtractor {
  canHandle(file: File): boolean;
  extract(file: File, options?: ExtractOptions): Promise<ExtractedDocument>;
}

export interface ExtractProgress {
  stage: "pdfjs" | "ocr" | "done";
  pageNumber?: number;
  totalPages?: number;
  message: string;
}

export interface ExtractOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExtractProgress) => void;
  pdfOcrMode?: "disabled" | "auto";
  pdfOcrTestOnly?: boolean;
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
