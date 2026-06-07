import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, chunkText } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

export class MarkdownExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return [".md", ".markdown"].includes(getFileExtension(file.name));
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const text = await file.text();
    const sections = splitMarkdownSections(text);
    const rawChunks = sections.flatMap((section) =>
      chunkText(section.text).map((chunk, chunkIndex) => ({
        chunkId: createId("chunk"),
        documentId,
        chunkType: "markdown" as const,
        text: chunk,
        heading: section.heading || `チャンク ${chunkIndex + 1}`,
        metadata: { headingLevel: section.headingLevel, chunkNumber: chunkIndex + 1 },
      })),
    );
    const chunks = assignChunkPositions(rawChunks);

    return {
      documentId,
      fileName: file.name,
      fileType: getReadableFileType(file.name, file.type),
      fileSize: file.size,
      importedAt: now,
      updatedAt: now,
      title: sections.find((section) => section.heading)?.heading || file.name,
      chunks,
      metadata: { markdownSectionCount: sections.length },
    };
  }
}

function splitMarkdownSections(text: string): Array<{ heading?: string; headingLevel?: number; text: string }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ heading?: string; headingLevel?: number; text: string }> = [];
  let currentHeading: string | undefined;
  let currentLevel: number | undefined;
  let buffer: string[] = [];

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match && buffer.join("\n").trim()) {
      sections.push({ heading: currentHeading, headingLevel: currentLevel, text: buffer.join("\n").trim() });
      buffer = [];
    }
    if (match) {
      currentHeading = match[2].trim();
      currentLevel = match[1].length;
    }
    buffer.push(line);
  }

  if (buffer.join("\n").trim()) {
    sections.push({ heading: currentHeading, headingLevel: currentLevel, text: buffer.join("\n").trim() });
  }

  return sections.length ? sections : [{ text }];
}
