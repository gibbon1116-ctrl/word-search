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
  transform?: number[];
  width?: number;
};

interface PdfPageLayout {
  text: string;
  tableRows?: string[][];
  tableColumnLabels?: string[];
}

interface PdfPositionedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

interface PdfLayoutRow {
  y: number;
  items: PdfPositionedTextItem[];
}

interface PdfTableColumn {
  label: string;
  x: number;
}

interface PdfPageExtraction {
  pageNumber: number;
  text: string;
  textItemCount: number;
  source: ExtractionSource;
  quality: PdfPageQuality;
  ocrConfidence?: number;
  ocrScale?: number;
  ocrLanguage?: string;
  ocrPreprocessMode?: string;
  ocrCandidateCount?: number;
  tableRows?: string[][];
  tableColumnLabels?: string[];
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
      const layout = buildPdfPageLayout(textContent.items);
      const quality = evaluatePageQuality(pageNumber, textContent.items.length, layout.text, "pdfjs");
      pageExtractions.push({
        pageNumber,
        text: layout.text,
        textItemCount: textContent.items.length,
        source: layout.text ? "pdfjs" : "none",
        quality,
        tableRows: layout.tableRows,
        tableColumnLabels: layout.tableColumnLabels,
      });
    }

    const pdfQuality = summarizePdfQuality(pageExtractions, file.name);
    if (pdfQuality.lowQuality && options.pdfOcrMode === "off") {
      throw new Error(createPdfFailureMessage(pdfQuality, false));
    }

    const shouldRunOcr =
      options.pdfOcrMode === "force" ||
      options.pdfOcrMode === "highAccuracy" ||
      (options.pdfOcrMode === "auto" &&
        (pdfQuality.lowQuality || pageExtractions.some((page) => page.source === "none" || page.quality.lowQuality)));

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
          ocrConfidence: page.ocrConfidence,
          ocrScale: page.ocrScale,
          ocrLanguage: page.ocrLanguage,
          ocrPreprocessMode: page.ocrPreprocessMode,
          ocrCandidateCount: page.ocrCandidateCount,
          textQualityScore: page.quality.textQualityScore,
          correctedSearchText: page.source === "ocr" ? applyOcrDictionaryCorrections(page.text) : undefined,
          originalOcrText: page.source === "ocr" ? page.text : undefined,
          tableKind: page.tableRows ? "pdf-layout" : undefined,
          tableRows: page.tableRows,
          tableColumnLabels: page.tableColumnLabels,
          tableStartRowNumber: page.tableRows ? 1 : undefined,
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
  const mode = options.pdfOcrMode ?? "auto";
  const language = options.pdfOcrLanguage ?? "jpn+eng";

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    assertNotAborted(options.signal);
    const current = pageExtractions[pageIndex];
    if (mode === "auto" && current.text && !current.quality.lowQuality) {
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
    const candidates = createOcrCandidates(mode);
    let best: PdfPageExtraction | undefined;

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      assertNotAborted(options.signal);
      const candidate = candidates[candidateIndex];
      const rendered = await renderPageToCanvas(page, candidate.scale);
      const canvas = candidate.preprocessMode === "none" ? rendered.canvas : preprocessOcrCanvas(rendered.canvas, candidate.preprocessMode);
      const result = await tesseract.recognize(canvas, language, {
        logger: (event) => {
          if (event.status === "recognizing text") {
            const percent = Math.round((event.progress ?? 0) * 100);
            options.onProgress?.({
              stage: "ocr",
              pageNumber,
              totalPages: maxPages,
              message: `OCRで文字を読み取っています。${pageNumber} / ${maxPages}ページ（候補${candidateIndex + 1}/${candidates.length}・${percent}%）`,
            });
          }
        },
      });
      const ocrText = compactWhitespace(result.data.text);
      if (!ocrText) {
        continue;
      }
      const quality = evaluatePageQuality(pageNumber, 0, ocrText, "ocr");
      quality.textQualityScore = Math.max(0, Math.min(1, quality.textQualityScore + ((result.data.confidence ?? 0) / 100) * 0.18));
      const extraction: PdfPageExtraction = {
        pageNumber,
        text: ocrText,
        textItemCount: 0,
        source: "ocr",
        quality,
        ocrConfidence: result.data.confidence,
        ocrScale: rendered.scale,
        ocrLanguage: language,
        ocrPreprocessMode: candidate.preprocessMode,
        ocrCandidateCount: candidates.length,
      };
      if (!best || extraction.quality.textQualityScore > best.quality.textQualityScore) {
        best = extraction;
      }
      if (mode !== "highAccuracy") {
        break;
      }
    }

    if (best) {
      pageExtractions[pageIndex] = best;
    }
  }
}

const MAX_OCR_PIXELS = 9_000_000;

type OcrPreprocessMode = "none" | "contrast" | "binary" | "sharpBinary";

function createOcrCandidates(mode: ExtractOptions["pdfOcrMode"]): Array<{ scale: number; preprocessMode: OcrPreprocessMode }> {
  if (mode === "highAccuracy") {
    return [
      { scale: 3, preprocessMode: "none" },
      { scale: 3, preprocessMode: "contrast" },
      { scale: 3, preprocessMode: "binary" },
      { scale: 4, preprocessMode: "sharpBinary" },
    ];
  }
  return [{ scale: 2, preprocessMode: "none" }];
}

async function renderPageToCanvas(page: PDFPageProxy, requestedScale: number): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const baseViewport = page.getViewport({ scale: 1 });
  const maxScale = Math.sqrt(MAX_OCR_PIXELS / Math.max(baseViewport.width * baseViewport.height, 1));
  const scale = Math.max(1.5, Math.min(requestedScale, maxScale));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("OCR用の画像を作成できませんでした。ブラウザを再読み込みしてから再度お試しください。");
  }
  await page.render({ canvasContext: context, viewport }).promise;
  return { canvas, scale };
}

function preprocessOcrCanvas(canvas: HTMLCanvasElement, mode: OcrPreprocessMode): HTMLCanvasElement {
  const next = document.createElement("canvas");
  next.width = canvas.width;
  next.height = canvas.height;
  const sourceContext = canvas.getContext("2d");
  const targetContext = next.getContext("2d");
  if (!sourceContext || !targetContext) {
    return canvas;
  }
  const image = sourceContext.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    let value = gray;
    if (mode === "contrast" || mode === "binary" || mode === "sharpBinary") {
      value = Math.max(0, Math.min(255, (gray - 128) * 1.55 + 128));
    }
    if (mode === "binary" || mode === "sharpBinary") {
      value = value > 172 ? 255 : 0;
    }
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  targetContext.putImageData(image, 0, 0);
  return mode === "sharpBinary" ? sharpenCanvas(next) : trimCanvasWhitespace(next);
}

function sharpenCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const trimmed = trimCanvasWhitespace(canvas);
  const context = trimmed.getContext("2d");
  if (!context) {
    return trimmed;
  }
  context.filter = "contrast(115%)";
  context.drawImage(trimmed, 0, 0);
  context.filter = "none";
  return trimmed;
}

function trimCanvasWhitespace(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX >= maxX || minY >= maxY) {
    return canvas;
  }
  const padding = 18;
  const sx = Math.max(0, minX - padding);
  const sy = Math.max(0, minY - padding);
  const sw = Math.min(width - sx, maxX - minX + padding * 2);
  const sh = Math.min(height - sy, maxY - minY + padding * 2);
  const next = document.createElement("canvas");
  next.width = sw;
  next.height = sh;
  next.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return next;
}

function buildPdfPageLayout(items: unknown[]): PdfPageLayout {
  const positionedItems = items
    .filter(isPositionedPdfTextItem)
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
      width: item.width ?? estimateTextWidth(item.str),
    }))
    .filter((item) => item.text);

  if (!positionedItems.length) {
    return { text: buildPdfFallbackText(items) };
  }

  const rowBuckets: PdfLayoutRow[] = [];
  for (const item of positionedItems.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rowBuckets.find((candidate) => Math.abs(candidate.y - item.y) <= 4);
    if (row) {
      row.items.push(item);
      row.y = (row.y + item.y) / 2;
    } else {
      rowBuckets.push({ y: item.y, items: [item] });
    }
  }

  const layoutRows = rowBuckets.sort((a, b) => b.y - a.y);
  const fallbackRows = layoutRows.map((row) => createPdfLayoutCells(row.items)).filter((row) => row.some(Boolean));
  const table = createPdfTable(layoutRows, fallbackRows);
  const rows = table?.rows ?? fallbackRows;
  const text = rows.map((row) => row.join(table ? "\t" : " ")).join("\n").trim();
  return { text, tableRows: table?.rows, tableColumnLabels: table?.columnLabels };
}

function buildPdfFallbackText(items: unknown[]): string {
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

function isPositionedPdfTextItem(item: unknown): item is PdfTextItem & { transform: number[] } {
  return (
    isPdfTextItem(item) &&
    Array.isArray(item.transform) &&
    item.transform.length >= 6 &&
    typeof item.transform[4] === "number" &&
    typeof item.transform[5] === "number"
  );
}

function createPdfLayoutCells(items: Array<{ text: string; x: number; width: number }>): string[] {
  const sortedItems = items.sort((a, b) => a.x - b.x);
  const cells: string[] = [];
  let previousRight = Number.NEGATIVE_INFINITY;

  for (const item of sortedItems) {
    const gap = item.x - previousRight;
    const startsNewCell = cells.length === 0 || gap > 12;
    if (startsNewCell) {
      cells.push(item.text);
    } else {
      const current = cells[cells.length - 1];
      const separator = shouldInsertSeparator(current.charAt(current.length - 1), item.text[0]) ? " " : "";
      cells[cells.length - 1] = `${current}${separator}${item.text}`;
    }
    previousRight = Math.max(previousRight, item.x + Math.max(item.width, estimateTextWidth(item.text)));
  }

  return cells;
}

function createPdfTable(
  layoutRows: PdfLayoutRow[],
  fallbackRows: string[][],
): { rows: string[][]; columnLabels?: string[] } | undefined {
  const columns = inferEstimateTableColumns(layoutRows);
  if (!columns.length) {
    return isTableLikeLayout(fallbackRows) ? { rows: fallbackRows } : undefined;
  }

  const rows = layoutRows
    .filter((row) => !isEstimateHeaderRow(row.items))
    .map((row) => assignItemsToColumns(row.items, columns))
    .filter((row) => row.some(Boolean));

  if (!isTableLikeLayout(rows)) {
    return isTableLikeLayout(fallbackRows) ? { rows: fallbackRows } : undefined;
  }

  return {
    rows,
    columnLabels: columns.map((column) => column.label),
  };
}

function inferEstimateTableColumns(rows: PdfLayoutRow[]): PdfTableColumn[] {
  const headerRow = rows.find((row) => isEstimateHeaderRow(row.items));
  if (!headerRow) {
    return [];
  }

  const allItems = rows.flatMap((row) => row.items);
  const clusters = createXClusters(allItems);
  const headerTextX = createHeaderTextXMap(headerRow.items);
  const minX = Math.min(...allItems.map((item) => item.x));
  const quantityTarget = getAverageX(headerTextX, ["数", "量"], minX + 225) + 28;
  const unitTarget = headerTextX.get("単位") ?? getAverageX(headerTextX, ["単", "位"], quantityTarget + 24);
  const unitPriceTarget = headerTextX.get("価") ?? getAverageX(headerTextX, ["単", "価"], unitTarget + 50);
  const amountTarget = headerTextX.get("額") ?? getAverageX(headerTextX, ["金", "額"], unitPriceTarget + 70);

  const columns: PdfTableColumn[] = [
    { label: "名称", x: chooseClusterX(clusters, minX, minX - 4, minX + 24) },
    { label: "摘要", x: chooseClusterX(clusters, (headerTextX.get("摘") ?? minX + 82) - 30, minX + 36, quantityTarget - 40) },
    { label: "数量", x: chooseClusterX(clusters, quantityTarget, quantityTarget - 45, quantityTarget + 18) },
    { label: "単位", x: chooseClusterX(clusters, unitTarget, unitTarget - 16, unitTarget + 18) },
    { label: "単価", x: chooseClusterX(clusters, unitPriceTarget, unitPriceTarget - 24, unitPriceTarget + 24) },
    { label: "金額", x: chooseClusterX(clusters, amountTarget, amountTarget - 32, amountTarget + 24) },
    { label: "備考", x: chooseClusterX(clusters, headerTextX.get("備") ?? amountTarget + 58, amountTarget + 24, amountTarget + 120) },
  ];

  const uniqueColumns: PdfTableColumn[] = [];
  for (const column of columns.sort((a, b) => a.x - b.x)) {
    const previous = uniqueColumns[uniqueColumns.length - 1];
    if (!previous || Math.abs(previous.x - column.x) > 12) {
      uniqueColumns.push(column);
    }
  }
  return uniqueColumns.length >= 4 ? uniqueColumns : [];
}

function assignItemsToColumns(items: PdfPositionedTextItem[], columns: PdfTableColumn[]): string[] {
  const cells = Array.from({ length: columns.length }, () => "");
  for (const item of items.sort((a, b) => a.x - b.x)) {
    const columnIndex = findNearestColumnIndex(item.x, columns);
    const current = cells[columnIndex];
    const separator = current && shouldInsertSeparator(current.charAt(current.length - 1), item.text[0]) ? " " : "";
    cells[columnIndex] = `${current}${separator}${item.text}`;
  }
  return cells;
}

function findNearestColumnIndex(x: number, columns: PdfTableColumn[]): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < columns.length; index += 1) {
    const distance = Math.abs(x - columns[index].x);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function isEstimateHeaderRow(items: PdfPositionedTextItem[]): boolean {
  const compactText = items
    .map((item) => item.text)
    .join("")
    .replace(/\s+/g, "");
  return compactText.includes("名称摘要数量単位単価金額備考");
}

function createHeaderTextXMap(items: PdfPositionedTextItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.text, item.x);
  }
  return map;
}

function getAverageX(map: Map<string, number>, keys: string[], fallback: number): number {
  const values = keys.map((key) => map.get(key)).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function createXClusters(items: PdfPositionedTextItem[]): Array<{ x: number; count: number }> {
  const clusters: Array<{ x: number; count: number }> = [];
  for (const item of items.sort((a, b) => a.x - b.x)) {
    const cluster = clusters.find((candidate) => Math.abs(candidate.x - item.x) <= 5);
    if (cluster) {
      cluster.x = (cluster.x * cluster.count + item.x) / (cluster.count + 1);
      cluster.count += 1;
    } else {
      clusters.push({ x: item.x, count: 1 });
    }
  }
  return clusters;
}

function chooseClusterX(clusters: Array<{ x: number; count: number }>, target: number, minX: number, maxX: number): number {
  const candidates = clusters.filter((cluster) => cluster.x >= minX && cluster.x <= maxX);
  if (!candidates.length) {
    return target;
  }
  return candidates.sort((a, b) => Math.abs(a.x - target) - Math.abs(b.x - target) || b.count - a.count)[0].x;
}

function isTableLikeLayout(rows: string[][]): boolean {
  const multiCellRows = rows.filter((row) => row.length >= 2);
  if (multiCellRows.length < 2) {
    return false;
  }
  const cellCountPattern = new Map<number, number>();
  for (const row of multiCellRows) {
    cellCountPattern.set(row.length, (cellCountPattern.get(row.length) ?? 0) + 1);
  }
  const repeatedColumnCount = Math.max(...cellCountPattern.values());
  return repeatedColumnCount >= 2 || multiCellRows.length / rows.length >= 0.5;
}

function estimateTextWidth(text: string): number {
  return Math.max(6, text.length * 6);
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

const TECHNICAL_TERMS = [
  "屋内配線",
  "電気設備",
  "分岐回路",
  "電圧降下",
  "内線規程",
  "受変電設備",
  "幹線設備",
  "コンセント",
  "照明器具",
  "配線用遮断器",
  "漏電遮断器",
  "接地",
  "単相3線式",
  "三相3線式",
  "JIS",
  "LAN",
  "Hf蛍光ランプ",
];

function applyOcrDictionaryCorrections(text: string): string {
  const normalizedText = text.normalize("NFKC");
  const additions = TECHNICAL_TERMS.filter((term) => {
    const normalizedTerm = term.normalize("NFKC");
    return normalizedText.includes(normalizedTerm) || isNearTermHit(normalizedText, normalizedTerm);
  });
  return additions.length ? `${text}\n${additions.join(" ")}` : text;
}

function isNearTermHit(text: string, term: string): boolean {
  const compactText = text.replace(/\s+/g, "");
  const compactTerm = term.replace(/\s+/g, "");
  if (compactText.includes(compactTerm)) {
    return true;
  }
  const grams = createGrams(compactTerm, compactTerm.length > 4 ? 3 : 2);
  if (!grams.length) {
    return false;
  }
  const hitCount = grams.filter((gram) => compactText.includes(gram)).length;
  return hitCount / grams.length >= 0.72;
}

function createGrams(text: string, size: number): string[] {
  if (text.length <= size) {
    return [text];
  }
  const grams: string[] = [];
  for (let index = 0; index <= text.length - size; index += 1) {
    grams.push(text.slice(index, index + size));
  }
  return grams;
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
