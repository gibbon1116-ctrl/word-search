export type ChunkType = "text" | "markdown" | "pdf-page" | "csv-row" | "excel-row" | "word-block" | "html-block" | "json";

export type ChunkMetadata = Record<string, unknown>;

export interface ExtractedChunk {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  chunkType: ChunkType;
  text: string;
  startOffset: number;
  endOffset: number;
  pageNumber?: number;
  sheetName?: string;
  cellRange?: string;
  rowNumber?: number;
  heading?: string;
  metadata: ChunkMetadata;
}
