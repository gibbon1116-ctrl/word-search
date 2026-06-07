import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, chunkText, compactWhitespace } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

export class HtmlExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return [".html", ".htm"].includes(getFileExtension(file.name)) || file.type.includes("html");
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const htmlText = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    doc.querySelectorAll("script,style,meta,noscript,template,svg").forEach((node) => node.remove());
    const title = doc.querySelector("title")?.textContent?.trim() || file.name;
    const bodyText = compactWhitespace(doc.body?.textContent || "");
    const rawChunks = chunkText(bodyText).map((chunk, index) => ({
      chunkId: createId("chunk"),
      documentId,
      chunkType: "html-block" as const,
      text: chunk,
      heading: `HTML本文 ${index + 1}`,
      metadata: { title, chunkNumber: index + 1 },
    }));
    const chunks = assignChunkPositions(rawChunks);

    return {
      documentId,
      fileName: file.name,
      fileType: getReadableFileType(file.name, file.type),
      fileSize: file.size,
      importedAt: now,
      updatedAt: now,
      title,
      chunks,
      metadata: { title },
    };
  }
}
