import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, chunkText } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

export class TextExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return getFileExtension(file.name) === ".txt" || file.type.startsWith("text/plain");
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const text = await file.text();
    const rawChunks = chunkText(text).map((chunk, index) => ({
      chunkId: createId("chunk"),
      documentId,
      chunkType: "text" as const,
      text: chunk,
      heading: `チャンク ${index + 1}`,
      metadata: { chunkNumber: index + 1 },
    }));
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
      metadata: { mimeType: file.type || "text/plain" },
    };
  }
}
