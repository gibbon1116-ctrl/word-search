import type { ExtractedChunk } from "./ExtractedChunk";

export interface ExtractedDocument {
  documentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  importedAt: string;
  updatedAt: string;
  title: string;
  chunks: ExtractedChunk[];
  metadata: Record<string, unknown>;
}
