import * as pdfjsLib from "pdfjs-dist";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, compactWhitespace } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export class PdfExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return getFileExtension(file.name) === ".pdf" || file.type.includes("pdf");
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const rawChunks = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = compactWhitespace(
        textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
      if (text) {
        rawChunks.push({
          chunkId: createId("chunk"),
          documentId,
          chunkType: "pdf-page" as const,
          text,
          pageNumber,
          metadata: { pageNumber },
        });
      }
    }

    const chunks = assignChunkPositions(rawChunks);

    if (!chunks.length) {
      throw new Error("PDFから文字を抽出できませんでした。スキャンPDFや画像PDFはOCRなしでは検索対象にできません。");
    }

    return {
      documentId,
      fileName: file.name,
      fileType: getReadableFileType(file.name, file.type),
      fileSize: file.size,
      importedAt: now,
      updatedAt: now,
      title: file.name,
      chunks,
      metadata: { pageCount: pdf.numPages, mimeType: file.type || "application/pdf" },
    };
  }
}
