import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { JA } from "../../i18n/ja";
import type { SearchResult } from "../../models/SearchResult";
import { SnippetText } from "./SnippetText";

export function SearchResultCard({ result }: { result: SearchResult }) {
  const ocrConfidence = typeof result.metadata.ocrConfidence === "number" ? result.metadata.ocrConfidence : undefined;
  return (
    <article className="result-card">
      <div className="result-header">
        <span className="file-type">{result.fileType}</span>
        <h2>{result.fileName}</h2>
      </div>
      <dl className="evidence-list">
        {result.pageNumber ? (
          <>
            <dt>{JA.labels.pageNumber}</dt>
            <dd>{result.pageNumber}</dd>
          </>
        ) : null}
        {result.sheetName ? (
          <>
            <dt>{JA.labels.sheetName}</dt>
            <dd>{result.sheetName}</dd>
          </>
        ) : null}
        {result.rowNumber ? (
          <>
            <dt>{JA.labels.rowNumber}</dt>
            <dd>{result.rowNumber}</dd>
          </>
        ) : null}
        {result.cellRange ? (
          <>
            <dt>{JA.labels.cellRange}</dt>
            <dd>{result.cellRange}</dd>
          </>
        ) : null}
        {result.heading ? (
          <>
            <dt>{JA.labels.heading}</dt>
            <dd>{result.heading}</dd>
          </>
        ) : null}
        {ocrConfidence !== undefined ? (
          <>
            <dt>OCR信頼度</dt>
            <dd className={ocrConfidence < 55 ? "low-confidence" : undefined}>
              {Math.round(ocrConfidence)}%
              {ocrConfidence < 55 ? "（低め）" : ""}
            </dd>
          </>
        ) : null}
      </dl>
      <p className="snippet">
        <SnippetText text={result.snippet} ranges={result.highlightRanges} />
      </p>
      <Link className="inline-link" to={`/documents/${result.documentId}?chunkId=${result.chunkId}`}>
        {JA.actions.openDetail}
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </article>
  );
}
