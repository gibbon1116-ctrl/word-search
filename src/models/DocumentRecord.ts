export type SourceType = "local" | "icloud" | "google_drive_via_files" | "unknown";

export interface DocumentRecord {
  documentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  importedAt: string;
  updatedAt: string;
  chunkCount: number;
  sourceType: SourceType;
  metadata: Record<string, unknown>;
}
