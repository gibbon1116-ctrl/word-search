import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SnippetText } from "../components/search/SnippetText";
import { JA } from "../i18n/ja";
import type { DocumentRecord } from "../models/DocumentRecord";
import type { SearchTermSummary } from "../models/SearchResult";
import { searchService } from "../services/search/SearchService";
import { storageService } from "../services/storage/StorageService";

export function SearchDocumentResultsPage() {
  const { documentId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("query") ?? "";
  const fileType = searchParams.get("fileType") ?? "all";
  const fileName = searchParams.get("fileName") ?? "";
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord>();
  const [termSummaries, setTermSummaries] = useState<SearchTermSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      storageService.getAllDocuments(),
      storageService.getAppSettings().then((settings) =>
        searchService.getTermSummaryWithinDocument(
          {
            query,
            fileType,
            fileName,
            snippetBeforeChars: settings.snippetBeforeChars,
            snippetAfterChars: settings.snippetAfterChars,
          },
          documentId,
        ),
      ),
    ])
      .then(([documents, summaries]) => {
        setDocumentRecord(documents.find((item) => item.documentId === documentId));
        setTermSummaries(summaries);
      })
      .finally(() => setIsLoading(false));
  }, [documentId, query, fileType, fileName]);

  const backParams = new URLSearchParams({ query });
  if (fileType !== "all") backParams.set("fileType", fileType);
  if (fileName) backParams.set("fileName", fileName);

  return (
    <div className="page-stack">
      <PageHeader
        title="書籍内の検索結果"
        description={documentRecord?.fileName ?? "検索結果を読み込んでいます。"}
        actions={<Link className="button secondary link-button" to={`/search/results?${backParams.toString()}`}>{JA.actions.back}</Link>}
      />

      {query ? (
        <section className="query-summary">
          <span>{JA.labels.searchKeyword}</span>
          <strong>{query}</strong>
        </section>
      ) : null}

      {isLoading ? <div className="status-banner">{JA.messages.searching}</div> : null}

      {!isLoading && !documentRecord ? (
        <EmptyState title={JA.messages.documentNotFound} description={JA.messages.documentDeletedMaybe} />
      ) : null}

      {!isLoading && documentRecord && termSummaries.length ? (
        <div className="term-summary-list">
          {termSummaries.map((summary) => (
            <section key={summary.term} className="info-section term-summary-section">
              <div className="section-heading">
                <h2>{summary.term}</h2>
                <span>{summary.hitCount.toLocaleString("ja-JP")}件</span>
              </div>
              {summary.pageNumbers.length ? <p className="helper-text">ページ: {formatValues(summary.pageNumbers.map(String))}</p> : null}
              <div className="card-list">
                {summary.snippets.map((snippet, index) => (
                  <article key={`${snippet.chunkId}-${index}`} className="term-snippet-card">
                    <div className="chunk-meta">
                      {snippet.pageNumber !== undefined ? <span>{JA.labels.pageNumber}: {snippet.pageNumber}</span> : null}
                      {snippet.sheetName ? <span>{JA.labels.sheetName}: {snippet.sheetName}</span> : null}
                      {snippet.rowNumber !== undefined ? <span>{JA.labels.rowNumber}: {snippet.rowNumber}</span> : null}
                      {snippet.heading ? <span>{JA.labels.heading}: {snippet.heading}</span> : null}
                    </div>
                    <p className="snippet">
                      <SnippetText text={snippet.snippet} ranges={snippet.highlightRanges} />
                    </p>
                    <Link className="inline-link" to={`/documents/${documentId}?${createDetailParams(snippet.chunkId, query, snippet.tableRowIndex)}`}>
                      該当箇所を開く
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {!isLoading && documentRecord && !termSummaries.length ? <EmptyState title={JA.messages.noSearchResults} /> : null}
    </div>
  );
}

function formatValues(values: string[]): string {
  if (values.length <= 12) return values.join(", ");
  return `${values.slice(0, 12).join(", ")} ほか${values.length - 12}件`;
}

function createDetailParams(chunkId: string, query: string, tableRowIndex?: number): string {
  const params = new URLSearchParams({ chunkId });
  if (query.trim()) params.set("query", query);
  if (typeof tableRowIndex === "number") params.set("row", String(tableRowIndex));
  return params.toString();
}
