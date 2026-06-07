import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, chunkText } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

export class JsonExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return getFileExtension(file.name) === ".json" || file.type.includes("json");
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const text = await file.text();
    let prettyJson = "";
    try {
      prettyJson = JSON.stringify(JSON.parse(text), null, 2);
    } catch (error) {
      throw new Error(`JSONの解析に失敗しました: ${error instanceof Error ? error.message : "形式を確認してください。"}`);
    }

    const rawChunks = chunkText(prettyJson).map((chunk, index) => ({
      chunkId: createId("chunk"),
      documentId,
      chunkType: "json" as const,
      text: chunk,
      heading: `JSON ${index + 1}`,
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
      metadata: {},
    };
  }
}
