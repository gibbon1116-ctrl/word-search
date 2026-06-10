import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/common/EmptyState";
import { MetaRow } from "../components/common/MetaRow";
import { PageHeader } from "../components/common/PageHeader";
import { SnippetText } from "../components/search/SnippetText";
import { JA } from "../i18n/ja";
import type { DocumentRecord } from "../models/DocumentRecord";
import type { ExtractedChunk } from "../models/ExtractedChunk";
import type { HighlightRange } from "../models/SearchResult";
import {
  createExportFileName,
  downloadBlob,
  exportDocumentAsCsv,
  exportDocumentAsJson,
  exportDocumentAsMarkdown,
  exportDocumentAsText,
} from "../services/export/DocumentExportService";
import { storageService } from "../services/storage/StorageService";
import { formatDateTime } from "../utils/dateUtils";
import { formatBytes } from "../utils/fileUtils";
import { normalizeForSearch, splitKeywords } from "../utils/textUtils";

export function DocumentDetailPage() {
  const { documentId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const selectedChunkId = searchParams.get("chunkId");
  const selectedTableRowIndex = parseTableRowIndex(searchParams.get("row"));
  const highlightQuery = searchParams.get("query") ?? "";
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord>();
  const [chunks, setChunks] = useState<ExtractedChunk[]>([]);
  const [chunkQuery, setChunkQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([storageService.getAllDocuments(), storageService.getChunksByDocument(documentId)]).then(([documents, nextChunks]) => {
      setDocumentRecord(documents.find((item) => item.documentId === documentId));
      setChunks(nextChunks);
    }).finally(() => setIsLoading(false));
  }, [documentId]);

  useEffect(() => {
    if (!selectedChunkId) return;
    window.setTimeout(() => {
      const rowId = typeof selectedTableRowIndex === "number" ? createTableRowId(selectedChunkId, selectedTableRowIndex) : undefined;
      document.getElementById(rowId ?? selectedChunkId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [selectedChunkId, selectedTableRowIndex, chunks.length]);

  const filteredChunks = useMemo(() => {
    if (!chunkQuery.trim()) return chunks;
    const normalized = normalizeForSearch(chunkQuery);
    return chunks.filter((chunk) => normalizeForSearch(`${chunk.heading ?? ""}\n${getChunkDisplayText(chunk)}`).includes(normalized));
  }, [chunkQuery, chunks]);

  function handleExport(format: "markdown" | "text" | "json" | "csv") {
    if (!documentRecord) return;
    const config = {
      markdown: {
        extension: "md",
        mimeType: "text/markdown;charset=utf-8",
        createContent: exportDocumentAsMarkdown,
      },
      text: {
        extension: "txt",
        mimeType: "text/plain;charset=utf-8",
        createContent: exportDocumentAsText,
      },
      json: {
        extension: "json",
        mimeType: "application/json;charset=utf-8",
        createContent: exportDocumentAsJson,
      },
      csv: {
        extension: "csv",
        mimeType: "text/csv;charset=utf-8",
        createContent: exportDocumentAsCsv,
      },
    }[format];
    const estimatedChars = chunks.reduce((total, chunk) => {
      const correctedSearchText = typeof chunk.metadata.correctedSearchText === "string" ? chunk.metadata.correctedSearchText : "";
      const originalOcrText = typeof chunk.metadata.originalOcrText === "string" ? chunk.metadata.originalOcrText : "";
      return total + (correctedSearchText || originalOcrText || chunk.text).length;
    }, 0);
    if ((format === "json" || format === "csv") && estimatedChars > 500_000) {
      const confirmed = window.confirm("出力内容が大きいため、作成に時間がかかる場合があります。このまま出力しますか？");
      if (!confirmed) return;
    }
    const content = config.createContent(documentRecord, chunks);
    downloadBlob(createExportFileName(documentRecord, config.extension), content, config.mimeType);
  }

  if (isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title={JA.screens.detail} />
        <div className="status-banner">{JA.messages.loading}</div>
      </div>
    );
  }

  if (!documentRecord) {
    return (
      <div className="page-stack">
        <PageHeader title={JA.screens.detail} />
        <EmptyState title={JA.messages.documentNotFound} description={JA.messages.documentDeletedMaybe} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={JA.screens.detail}
        description={documentRecord.fileName}
        actions={<Link className="button secondary link-button" to="/documents">{JA.actions.back}</Link>}
      />

      <section className="detail-panel">
        <MetaRow label={JA.labels.fileName} value={documentRecord.fileName} />
        <MetaRow label={JA.labels.fileType} value={documentRecord.fileType} />
        <MetaRow label={JA.labels.importedAt} value={formatDateTime(documentRecord.importedAt)} />
        <MetaRow label={JA.labels.fileSize} value={formatBytes(documentRecord.fileSize)} />
        <MetaRow label={JA.labels.chunkCount} value={documentRecord.chunkCount} />
      </section>

      <PdfDiagnosticsPanel metadata={documentRecord.metadata} />
      {chunks.some((chunk) => chunk.metadata.ocrUsed) ? (
        <Link className="button secondary link-button" to={`/documents/${documentId}/ocr`}>
          OCR結果を確認・修正
        </Link>
      ) : null}

      <section className="info-section">
        <h2>OCR全文エクスポート</h2>
        <p className="helper-text">PDF以外の資料も、保存済みチャンク本文を端末内でファイル出力できます。</p>
        <div className="export-actions">
          <button type="button" className="button secondary" onClick={() => handleExport("markdown")}>
            OCR全文をMarkdownで出力
          </button>
          <button type="button" className="button secondary" onClick={() => handleExport("text")}>
            OCR全文をTXTで出力
          </button>
          <button type="button" className="button secondary" onClick={() => handleExport("json")}>
            OCR全文をJSONで出力
          </button>
          <button type="button" className="button secondary" onClick={() => handleExport("csv")}>
            OCR全文をCSVで出力
          </button>
        </div>
      </section>

      <section className="filter-panel">
        <label>
          {JA.labels.chunkSearch}
          <input
            type="search"
            value={chunkQuery}
            placeholder={JA.placeholders.detailSearch}
            onChange={(event) => setChunkQuery(event.target.value)}
          />
        </label>
      </section>

      <section>
        <div className="section-heading">
          <h2>{JA.labels.extractedChunks}</h2>
          <span>{filteredChunks.length}件</span>
        </div>
        <div className="chunk-list">
          {filteredChunks.map((chunk) => (
            <article id={chunk.chunkId} key={chunk.chunkId} className={`chunk-card ${chunk.chunkId === selectedChunkId ? "selected" : ""}`}>
              <div className="chunk-meta">
                <span>チャンク {chunk.chunkIndex + 1}</span>
                {chunk.pageNumber ? <span>{JA.labels.pageNumber}: {chunk.pageNumber}</span> : null}
                {chunk.sheetName ? <span>{JA.labels.sheetName}: {chunk.sheetName}</span> : null}
                {chunk.rowNumber ? <span>{JA.labels.rowNumber}: {chunk.rowNumber}</span> : null}
                {chunk.cellRange ? <span>{JA.labels.cellRange}: {chunk.cellRange}</span> : null}
                {chunk.heading ? <span>{JA.labels.heading}: {chunk.heading}</span> : null}
              </div>
              {getChunkTableRows(chunk) ? (
                <ChunkTable chunk={chunk} query={highlightQuery} selectedRowIndex={chunk.chunkId === selectedChunkId ? selectedTableRowIndex : undefined} />
              ) : (
                <pre>
                  <SnippetText text={getChunkDisplayText(chunk)} ranges={createHighlightRanges(getChunkDisplayText(chunk), highlightQuery)} />
                </pre>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="info-section">
        <h2>{JA.labels.metadata}</h2>
        <pre className="metadata-pre">{JSON.stringify(documentRecord.metadata, null, 2)}</pre>
      </section>
    </div>
  );
}

function getChunkDisplayText(chunk: ExtractedChunk): string {
  const correctedSearchText = typeof chunk.metadata.correctedSearchText === "string" ? chunk.metadata.correctedSearchText.trim() : "";
  const originalOcrText = typeof chunk.metadata.originalOcrText === "string" ? chunk.metadata.originalOcrText.trim() : "";
  return correctedSearchText || originalOcrText || chunk.text;
}

function getChunkTableRows(chunk: ExtractedChunk): string[][] | undefined {
  const rows = chunk.metadata.tableRows;
  if (!Array.isArray(rows) || !rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string"))) {
    return undefined;
  }
  return rows;
}

function getChunkTableColumnLabels(chunk: ExtractedChunk, columnCount: number): string[] {
  const labels = chunk.metadata.tableColumnLabels;
  if (Array.isArray(labels) && labels.every((label) => typeof label === "string")) {
    return labels;
  }
  return Array.from({ length: columnCount }, (_, index) => `列${index + 1}`);
}

function ChunkTable({ chunk, query, selectedRowIndex }: { chunk: ExtractedChunk; query: string; selectedRowIndex?: number }) {
  const rows = getChunkTableRows(chunk);
  if (!rows) {
    return null;
  }
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnLabels = getChunkTableColumnLabels(chunk, columnCount);
  const startRowNumber = typeof chunk.metadata.tableStartRowNumber === "number" ? chunk.metadata.tableStartRowNumber : 1;

  return (
    <div className="chunk-table-wrap">
      <table className="chunk-table">
        <thead>
          <tr>
            <th scope="col">行</th>
            {columnLabels.map((label, index) => (
              <th scope="col" key={`${label}-${index}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr id={createTableRowId(chunk.chunkId, rowIndex)} key={rowIndex} className={rowIndex === selectedRowIndex ? "selected-table-row" : undefined}>
              <th scope="row">{startRowNumber + rowIndex}</th>
              {Array.from({ length: columnCount }, (_, columnIndex) => {
                const cell = row[columnIndex] ?? "";
                return (
                  <td key={columnIndex}>
                    <SnippetText text={cell} ranges={createHighlightRanges(cell, query)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseTableRowIndex(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function createTableRowId(chunkId: string, rowIndex: number): string {
  return `${chunkId}-row-${rowIndex}`;
}

function createHighlightRanges(text: string, query: string): HighlightRange[] {
  const terms = Array.from(new Set(splitKeywords(query)));
  const ranges: HighlightRange[] = [];
  const lowerText = text.toLocaleLowerCase("ja-JP");

  for (const term of terms) {
    const lowerTerm = term.toLocaleLowerCase("ja-JP");
    if (!lowerTerm) continue;
    let cursor = 0;
    while (cursor < lowerText.length) {
      const found = lowerText.indexOf(lowerTerm, cursor);
      if (found < 0) break;
      ranges.push({ start: found, end: found + lowerTerm.length });
      cursor = found + Math.max(lowerTerm.length, 1);
    }
  }

  return mergeHighlightRanges(ranges);
}

function mergeHighlightRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }
  return merged;
}

function PdfDiagnosticsPanel({ metadata }: { metadata: Record<string, unknown> }) {
  const diagnostics = metadata.pdfDiagnostics;
  if (!isPdfDiagnostics(diagnostics)) {
    return null;
  }

  const sourceLabel = diagnostics.ocrPageCount > 0 ? "PDF.js + OCR" : "PDF.js";
  return (
    <section className="info-section">
      <h2>PDF抽出診断</h2>
      <div className="diagnostic-grid">
        <span>抽出方式</span>
        <strong>{sourceLabel}</strong>
        <span>抽出文字数</span>
        <strong>{diagnostics.totalTextLength.toLocaleString("ja-JP")}文字</strong>
        <span>OCR使用ページ</span>
        <strong>{diagnostics.ocrPageCount.toLocaleString("ja-JP")}ページ</strong>
        <span>低品質ページ</span>
        <strong>{diagnostics.lowQualityPageCount.toLocaleString("ja-JP")}ページ</strong>
      </div>
      {diagnostics.diagnostics.length ? (
        <ul className="diagnostic-list">
          {diagnostics.diagnostics.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : (
        <p className="helper-text">PDF文字層から本文を取得できています。</p>
      )}
    </section>
  );
}

function isPdfDiagnostics(value: unknown): value is {
  totalTextLength: number;
  lowQualityPageCount: number;
  ocrPageCount: number;
  diagnostics: string[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "totalTextLength" in value &&
    "lowQualityPageCount" in value &&
    "ocrPageCount" in value &&
    "diagnostics" in value &&
    Array.isArray((value as { diagnostics: unknown }).diagnostics)
  );
}
