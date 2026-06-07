import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { SearchDocumentSummary } from "../../models/SearchResult";

export function SearchDocumentSummaryCard({ summary, searchParams }: { summary: SearchDocumentSummary; searchParams: URLSearchParams }) {
  const params = new URLSearchParams(searchParams);
  const hasLowConfidence = summary.minOcrConfidence !== undefined && summary.minOcrConfidence < 55;

  return (
    <article className="result-card document-summary-card">
      <Link className="summary-card-link" to={`/search/results/${summary.documentId}?${params.toString()}`}>
        <div className="result-header">
          <span className="file-type">{summary.fileType}</span>
          <h2>{summary.fileName}</h2>
        </div>
        <dl className="evidence-list">
          <dt>ヒット件数</dt>
          <dd>{summary.totalHitCount.toLocaleString("ja-JP")}件</dd>
          <dt>ヒットチャンク</dt>
          <dd>{summary.matchedChunkCount.toLocaleString("ja-JP")}件</dd>
          {summary.matchedPageNumbers.length ? (
            <>
              <dt>ヒットページ</dt>
              <dd>{formatValues(summary.matchedPageNumbers.map(String))}</dd>
            </>
          ) : null}
          {summary.matchedSheetNames.length ? (
            <>
              <dt>シート</dt>
              <dd>{formatValues(summary.matchedSheetNames)}</dd>
            </>
          ) : null}
          {summary.matchedTerms.length ? (
            <>
              <dt>ヒット語句</dt>
              <dd>{formatValues(summary.matchedTerms)}</dd>
            </>
          ) : null}
          <dt>OCR</dt>
          <dd>
            {summary.ocrUsed ? "使用あり" : "使用なし"}
            {summary.minOcrConfidence !== undefined ? ` / 最低信頼度 ${Math.round(summary.minOcrConfidence)}%` : ""}
          </dd>
        </dl>
        {hasLowConfidence ? <div className="status-banner summary-warning">OCR信頼度が低いページを含みます。</div> : null}
        <p className="snippet">{summary.topSnippet}</p>
        <span className="inline-link">
          この書籍内のヒットを見る
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </Link>
    </article>
  );
}

function formatValues(values: string[]): string {
  if (values.length <= 8) return values.join(", ");
  return `${values.slice(0, 8).join(", ")} ほか${values.length - 8}件`;
}
