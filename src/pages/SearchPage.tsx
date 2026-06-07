import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { JA } from "../i18n/ja";
import type { DocumentRecord } from "../models/DocumentRecord";
import type { SearchHistoryItem } from "../models/SearchResult";
import { storageService } from "../services/storage/StorageService";

export function SearchPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [fileType, setFileType] = useState("all");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    Promise.all([storageService.getAllDocuments(), storageService.getSearchHistory()]).then(([docs, items]) => {
      setDocuments(docs);
      setHistory(items);
    });
  }, []);

  const fileTypes = useMemo(() => Array.from(new Set(documents.map((document) => document.fileType))), [documents]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const params = new URLSearchParams({ query: query.trim() });
    if (fileType !== "all") params.set("fileType", fileType);
    if (fileName.trim()) params.set("fileName", fileName.trim());
    navigate(`/search/results?${params.toString()}`);
  }

  return (
    <div className="page-stack">
      <PageHeader title={JA.screens.search} description={JA.descriptions.search} />

      <form className="search-form" onSubmit={handleSubmit}>
        <label>
          {JA.labels.searchKeyword}
          <input type="search" value={query} placeholder={JA.placeholders.search} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          {JA.labels.fileType}
          <select value={fileType} onChange={(event) => setFileType(event.target.value)}>
            <option value="all">{JA.labels.allFileTypes}</option>
            {fileTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          {JA.labels.fileName}
          <input type="search" value={fileName} placeholder={JA.placeholders.fileName} onChange={(event) => setFileName(event.target.value)} />
        </label>
        <PrimaryButton type="submit">{JA.actions.searchDocuments}</PrimaryButton>
      </form>

      <section>
        <div className="section-heading">
          <h2>{JA.labels.searchHistory}</h2>
        </div>
        {history.length ? (
          <div className="history-list">
            {history.map((item) => (
              <button key={item.id} type="button" onClick={() => setQuery(item.query)}>
                <span>{item.query}</span>
                <small>{item.resultCount}件</small>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title={JA.messages.noSearchHistory} description={JA.messages.noSearchHistoryDescription} />
        )}
      </section>
    </div>
  );
}
