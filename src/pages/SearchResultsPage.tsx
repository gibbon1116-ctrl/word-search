import { useEffect, useState } from "react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SearchDocumentSummaryCard } from "../components/search/SearchDocumentSummaryCard";
import { JA } from "../i18n/ja";
import type { SearchDocumentSummary } from "../models/SearchResult";
import { searchService } from "../services/search/SearchService";
import { storageService } from "../services/storage/StorageService";

export function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("query") ?? "";
  const fileType = searchParams.get("fileType") ?? "all";
  const fileName = searchParams.get("fileName") ?? "";
  const [documentSummaries, setDocumentSummaries] = useState<SearchDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;
    setIsLoading(true);
    storageService
      .getAppSettings()
      .then(async (settings) => {
        const criteria = {
          query,
          fileType,
          fileName,
          snippetBeforeChars: settings.snippetBeforeChars,
          snippetAfterChars: settings.snippetAfterChars,
        };
        return searchService.searchGroupedByDocument(criteria);
      })
      .then(setDocumentSummaries)
      .finally(() => setIsLoading(false));
  }, [query, fileType, fileName]);

  const resultCount = documentSummaries.length;
  const titleMatchedSummaries = useMemo(() => documentSummaries.filter((summary) => summary.titleMatched), [documentSummaries]);
  const contentMatchedSummaries = useMemo(() => documentSummaries.filter((summary) => !summary.titleMatched), [documentSummaries]);
  const documentResultParams = new URLSearchParams(searchParams);
  documentResultParams.delete("view");

  return (
    <div className="page-stack">
      <PageHeader
        title={JA.screens.results}
        description={isLoading ? "検索しています。" : `ヒットした書籍: ${resultCount}件`}
        actions={<Link className="button secondary link-button" to="/search">{JA.actions.back}</Link>}
      />

      {query ? (
        <section className="query-summary">
          <span>{JA.labels.searchKeyword}</span>
          <strong>{query}</strong>
        </section>
      ) : null}

      {isLoading ? <div className="status-banner">{JA.messages.searching}</div> : null}

      {!isLoading && documentSummaries.length ? (
        <>
          {titleMatchedSummaries.length ? (
            <section>
              <div className="section-heading">
                <h2>タイトルに一致した書籍</h2>
                <span>{titleMatchedSummaries.length}件</span>
              </div>
              <div className="card-list">
                {titleMatchedSummaries.map((summary) => (
                  <SearchDocumentSummaryCard key={summary.documentId} summary={summary} searchParams={documentResultParams} />
                ))}
              </div>
            </section>
          ) : null}

          {contentMatchedSummaries.length ? (
            <section>
              <div className="section-heading">
                <h2>本文に一致した書籍</h2>
                <span>{contentMatchedSummaries.length}件</span>
              </div>
              <div className="card-list">
                {contentMatchedSummaries.map((summary) => (
                  <SearchDocumentSummaryCard key={summary.documentId} summary={summary} searchParams={documentResultParams} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {!isLoading && !resultCount ? <EmptyState title={JA.messages.noSearchResults} /> : null}
    </div>
  );
}
