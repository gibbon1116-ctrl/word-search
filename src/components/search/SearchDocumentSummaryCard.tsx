import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { SearchDocumentSummary } from "../../models/SearchResult";

export function SearchDocumentSummaryCard({ summary, searchParams }: { summary: SearchDocumentSummary; searchParams: URLSearchParams }) {
  const params = new URLSearchParams(searchParams);

  return (
    <article className="result-card document-summary-card">
      <Link className="summary-card-link" to={`/search/results/${summary.documentId}?${params.toString()}`}>
        <div className="result-header">
          <h2>{summary.fileName}</h2>
          {summary.titleMatched ? <span className="match-badge">タイトルに一致</span> : null}
        </div>
        <dl className="evidence-list">
          <dt>本文ヒット</dt>
          <dd>{summary.contentHitCount.toLocaleString("ja-JP")}件</dd>
          <dt>ヒット件数</dt>
          <dd>{summary.totalHitCount.toLocaleString("ja-JP")}件</dd>
          {summary.titleMatched && summary.titleMatchText ? (
            <>
              <dt>一致タイトル</dt>
              <dd>{summary.titleMatchText}</dd>
            </>
          ) : null}
          <dt>OCR</dt>
          <dd>
            {summary.ocrUsed ? "使用あり" : "使用なし"}
            {summary.minOcrConfidence !== undefined ? ` / 最低信頼度 ${Math.round(summary.minOcrConfidence)}%` : ""}
          </dd>
        </dl>
        <span className="inline-link">
          この書籍内のヒットを見る
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </Link>
    </article>
  );
}
