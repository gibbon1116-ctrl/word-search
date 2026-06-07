import * as pdfjsLib from "pdfjs-dist";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, compactWhitespace } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
};

export class PdfExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return getFileExtension(file.name) === ".pdf" || file.type.includes("pdf");
  }

  async extract(file: File): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data,
      cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
      useWorkerFetch: true,
    }).promise;
    const rawChunks = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
      const text = buildPdfPageText(textContent.items);
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
      throw new Error(
        "PDFから文字を抽出できませんでした。文字情報を持たないスキャンPDF、画像のみのPDF、または特殊な埋め込みフォントのPDFは、OCRなしでは検索対象にできない場合があります。",
      );
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

function buildPdfPageText(items: unknown[]): string {
  let text = "";
  for (const item of items) {
    if (!isPdfTextItem(item)) {
      continue;
    }
    const value = item.str.trim();
    if (!value) {
      continue;
    }

    if (text && shouldInsertSeparator(text.charAt(text.length - 1), value[0])) {
      text += " ";
    }
    text += value;
    if (item.hasEOL) {
      text += "\n";
    }
  }
  return compactWhitespace(text);
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return typeof item === "object" && item !== null && "str" in item && typeof (item as PdfTextItem).str === "string";
}

function shouldInsertSeparator(previous: string, next: string): boolean {
  if (!previous || previous === "\n" || next === "\n") {
    return false;
  }
  if (isCjk(previous) || isCjk(next)) {
    return false;
  }
  if (/[\s([{「『【（]/.test(previous) || /[\s,.;:!?%)]}、。）」』】]/.test(next)) {
    return false;
  }
  return true;
}

function isCjk(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(value);
}
