import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { assignChunkPositions, createId, compactWhitespace } from "../../utils/textUtils";
import { getFileExtension, getReadableFileType } from "../../utils/fileUtils";
import type { DocumentExtractor, ExtractOptions } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type ExtractionSource = "pdfjs" | "ocr" | "none";

type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
};

interface PdfPageExtraction {
  pageNumber: number;
  text: string;
  textItemCount: number;
  source: ExtractionSource;
  quality: PdfPageQuality;
}

interface PdfPageQuality {
  pageNumber: number;
  textItemCount: number;
  extractedTextLength: number;
  sampleText: string;
  suspiciousCharacterRatio: number;
  japaneseCharacterRatio: number;
  extractionSource: ExtractionSource;
  textQualityScore: number;
  lowQuality: boolean;
  diagnostics: string[];
}

export class PdfExtractor implements DocumentExtractor {
  canHandle(file: File): boolean {
    return getFileExtension(file.name) === ".pdf" || file.type.includes("pdf");
  }

  async extract(file: File, options: ExtractOptions = {}): Promise<ExtractedDocument> {
    const documentId = createId("doc");
    const now = new Date().toISOString();
    const data = await file.arrayBuffer();
    const pdfjsAssetBase = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).toString();
    const pdf = await pdfjsLib.getDocument({
      data,
      cMapUrl: `${pdfjsAssetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${pdfjsAssetBase}standard_fonts/`,
      useWorkerFetch: false,
    }).promise;

    const pageExtractions: PdfPageExtraction[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      assertNotAborted(options.signal);
      options.onProgress?.({
        stage: "pdfjs",
        pageNumber,
        totalPages: pdf.numPages,
        message: `PDF文字層を確認しています。${pageNumber} / ${pdf.numPages}ページ`,
      });

      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
      const text = buildPdfPageText(textContent.items);
      const quality = evaluatePageQuality(pageNumber, textContent.items.length, text, "pdfjs");
      pageExtractions.push({
        pageNumber,
        text,
        textItemCount: textContent.items.length,
        source: text ? "pdfjs" : "none",
        quality,
      });
    }

    const pdfQuality = summarizePdfQuality(pageExtractions, file.name);
    if (pdfQuality.lowQuality && options.pdfOcrMode !== "auto") {
      throw new Error(createPdfFailureMessage(pdfQuality, false));
    }

    const shouldRunOcr =
      options.pdfOcrMode === "auto" &&
      (pdfQuality.lowQuality || pageExtractions.some((page) => page.source === "none" || page.quality.lowQuality));

    if (shouldRunOcr) {
      await runOcrFallback(pdf, pageExtractions, options);
    }

    const usablePages = pageExtractions.filter((page) => page.text.trim());
    if (!usablePages.length) {
      throw new Error(createPdfFailureMessage(pdfQuality, options.pdfOcrMode === "auto"));
    }

    const chunks = assignChunkPositions(
      usablePages.map((page) => ({
        chunkId: createId("chunk"),
        documentId,
        chunkType: "pdf-page" as const,
        text: page.text,
        pageNumber: page.pageNumber,
        metadata: {
          pageNumber: page.pageNumber,
          extractionSource: page.source,
          ocrUsed: page.source === "ocr",
          textQualityScore: page.quality.textQualityScore,
          pdfDiagnostics: page.quality,
        },
      })),
    );

    options.onProgress?.({ stage: "done", totalPages: pdf.numPages, message: "PDF本文の抽出が完了しました。" });

    return {
      documentId,
      fileName: file.name,
      fileType: getReadableFileType(file.name, file.type),
      fileSize: file.size,
      importedAt: now,
      updatedAt: now,
      title: file.name,
      chunks,
      metadata: {
        pageCount: pdf.numPages,
        mimeType: file.type || "application/pdf",
        pdfDiagnostics: {
          ...pdfQuality,
          pages: pageExtractions.map((page) => page.quality),
        },
      },
    };
  }
}

async function runOcrFallback(
  pdf: PDFDocumentProxy,
  pageExtractions: PdfPageExtraction[],
  options: ExtractOptions,
): Promise<void> {
  const maxPages = options.pdfOcrTestOnly ? Math.min(3, pdf.numPages) : pdf.numPages;
  const tesseract = await import("tesseract.js");

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    assertNotAborted(options.signal);
    const current = pageExtractions[pageIndex];
    if (current.text && !current.quality.lowQuality) {
      continue;
    }

    const pageNumber = pageIndex + 1;
    options.onProgress?.({
      stage: "ocr",
      pageNumber,
      totalPages: maxPages,
      message: `OCRで文字を読み取っています。${pageNumber} / ${maxPages}ページ`,
    });

    const page = await pdf.getPage(pageNumber);
    const canvas = await renderPageToCanvas(page);
    const result = await tesseract.recognize(canvas, "jpn", {
      logger: (event) => {
        if (event.status === "recognizing text") {
          const percent = Math.round((event.progress ?? 0) * 100);
          options.onProgress?.({
            stage: "ocr",
            pageNumber,
            totalPages: maxPages,
            message: `OCRで文字を読み取っています。${pageNumber} / ${maxPages}ページ（${percent}%）`,
          });
        }
      },
    });
    const ocrText = compactWhitespace(result.data.text);
    if (ocrText) {
      const quality = evaluatePageQuality(pageNumber, 0, ocrText, "ocr");
      pageExtractions[pageIndex] = {
        pageNumber,
        text: ocrText,
        textItemCount: 0,
        source: "ocr",
        quality,
      };
    }
  }
}

async function renderPageToCanvas(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OCR用の画像を作成できませんでした。ブラウザを再読み込みしてから再度お試しください。");
  }
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
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

function evaluatePageQuality(
  pageNumber: number,
  textItemCount: number,
  text: string,
  extractionSource: ExtractionSource,
): PdfPageQuality {
  const sampleText = text.slice(0, 120);
  const extractedTextLength = text.length;
  const suspiciousCharacterRatio = ratio(text, /[■□�]/g) + (text.match(/\?{2,}/g)?.join("").length ?? 0) / Math.max(text.length, 1);
  const japaneseCharacterRatio = ratio(text, /[\u3040-\u30ff\u3400-\u9fff]/g);
  const symbolRatio = ratio(sampleText, /[^\p{L}\p{N}\s、。，．・「」『』（）()【】\-_/]/gu);
  const diagnostics: string[] = [];

  if (extractedTextLength === 0) {
    diagnostics.push("このページはPDF文字層から本文を取得できませんでした。画像主体のPDFである可能性があります。");
  }
  if (extractedTextLength > 0 && extractedTextLength < 20) {
    diagnostics.push("抽出文字数が少ないため、検索に十分な本文が取れていない可能性があります。");
  }
  if (suspiciousCharacterRatio > 0.08) {
    diagnostics.push("不審な文字が多く、文字化けの可能性があります。");
  }
  if (symbolRatio > 0.35) {
    diagnostics.push("ページ先頭のサンプルが記号に偏っています。CMapまたはフォント情報の問題が疑われます。");
  }

  const textQualityScore = Math.max(
    0,
    Math.min(1, 1 - suspiciousCharacterRatio * 2 - symbolRatio * 0.5 - (extractedTextLength < 20 ? 0.45 : 0)),
  );
  const lowQuality = extractedTextLength === 0 || extractedTextLength < 20 || suspiciousCharacterRatio > 0.08 || symbolRatio > 0.35;

  return {
    pageNumber,
    textItemCount,
    extractedTextLength,
    sampleText,
    suspiciousCharacterRatio,
    japaneseCharacterRatio,
    extractionSource,
    textQualityScore,
    lowQuality,
    diagnostics,
  };
}

function summarizePdfQuality(pages: PdfPageExtraction[], fileName: string) {
  const totalTextLength = pages.reduce((sum, page) => sum + page.text.length, 0);
  const lowQualityPageCount = pages.filter((page) => page.quality.lowQuality).length;
  const ocrPageCount = pages.filter((page) => page.source === "ocr").length;
  const emptyPageCount = pages.filter((page) => !page.text.trim()).length;
  const combinedText = pages.map((page) => page.text).join("\n");
  const japaneseCharacterRatio = ratio(combinedText, /[\u3040-\u30ff\u3400-\u9fff]/g);
  const suspiciousCharacterRatio = ratio(combinedText, /[■□�]/g);
  const fileNameSuggestsJapanese = /[\u3040-\u30ff\u3400-\u9fff]/.test(fileName);
  const diagnostics = new Set<string>();

  if (totalTextLength < Math.min(120, pages.length * 20)) {
    diagnostics.add("PDF全体の抽出文字数が少ないため、画像主体のPDFである可能性があります。");
  }
  if (fileNameSuggestsJapanese && totalTextLength > 0 && japaneseCharacterRatio < 0.05) {
    diagnostics.add("日本語PDFの可能性がありますが、日本語文字の割合が低いため文字化けが疑われます。");
  }
  if (suspiciousCharacterRatio > 0.05) {
    diagnostics.add("不審な文字が多く、PDF内の文字情報が文字化けしている可能性があります。");
  }
  if (lowQualityPageCount > 0) {
    diagnostics.add("一部のページで抽出品質が低く、OCR登録を試す価値があります。");
  }

  return {
    totalTextLength,
    lowQualityPageCount,
    ocrPageCount,
    emptyPageCount,
    japaneseCharacterRatio,
    suspiciousCharacterRatio,
    lowQuality: totalTextLength < Math.min(120, pages.length * 20) || lowQualityPageCount > Math.max(0, pages.length * 0.25),
    diagnostics: Array.from(diagnostics),
  };
}

function createPdfFailureMessage(summary: ReturnType<typeof summarizePdfQuality>, ocrTried: boolean): string {
  if (ocrTried) {
    return "PDFから検索用本文を取得できませんでした。OCRでも文字を読み取れない画像、または特殊なPDFの可能性があります。";
  }
  if (summary.totalTextLength === 0 || summary.emptyPageCount > 0) {
    return "このPDFは画像主体のPDFです。OCRを使うと検索できる可能性があります。ファイル登録画面で「OCRを使って登録」を有効にしてください。";
  }
  if (summary.suspiciousCharacterRatio > 0.05 || summary.lowQuality) {
    return "PDF内の文字情報が文字化けしている可能性があります。OCR登録を試してください。";
  }
  return "日本語CMapまたは標準フォントデータの読込に失敗した可能性があります。再読み込みまたはキャッシュ削除後に再登録してください。";
}

function ratio(text: string, pattern: RegExp): number {
  if (!text.length) {
    return 0;
  }
  const matches = text.match(pattern);
  return (matches?.join("").length ?? 0) / text.length;
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

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("登録処理をキャンセルしました。");
  }
}
