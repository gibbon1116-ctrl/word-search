import mammoth from "mammoth/mammoth.browser";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, compactWhitespace } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

export class WordDocxExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return getFileExtension(file.name) === ".docx";
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const parser = new DOMParser();
    const html = parser.parseFromString(result.value, "text/html");
    const blocks = Array.from(html.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,td,th"));
    const rawChunks = [];
    let heading = "";
    let paragraphNumber = 0;

    for (const block of blocks) {
      const tag = block.tagName.toLowerCase();
      const text = compactWhitespace(block.textContent || "");
      if (!text) continue;
      if (/^h[1-6]$/.test(tag)) {
        heading = text;
      }
      paragraphNumber += 1;
      rawChunks.push({
        chunkId: createId("chunk"),
        documentId,
        chunkType: "word-block" as const,
        text,
        heading: heading || `段落 ${paragraphNumber}`,
        metadata: { tag, paragraphNumber },
      });
    }

    if (!rawChunks.length) {
      const raw = await mammoth.extractRawText({ arrayBuffer });
      const rawText = compactWhitespace(raw.value);
      if (!rawText) {
        throw new Error("Word .docxから検索できる文字を取得できませんでした。ファイルが破損していないか確認してください。");
      }
      rawChunks.push({
        chunkId: createId("chunk"),
        documentId,
        chunkType: "word-block" as const,
        text: rawText,
        heading: "本文",
        metadata: { fallback: "extractRawText" },
      });
    }

    const chunks = assignChunkPositions(rawChunks);

    return {
      documentId,
      fileName: file.name,
      fileType: getReadableFileType(file.name, file.type),
      fileSize: file.size,
      importedAt: now,
      updatedAt: now,
      title: chunks.find((chunk) => chunk.heading)?.heading || file.name,
      chunks,
      metadata: { messages: result.messages },
    };
  }
}
