import { Database, Search, UploadCloud } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DocumentCard } from "../components/document/DocumentCard";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { JA } from "../i18n/ja";
import type { DocumentRecord } from "../models/DocumentRecord";
import { storageService } from "../services/storage/StorageService";

export function HomePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    storageService.getAllDocuments().then(setDocuments).catch(() => setDocuments([]));
  }, []);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    navigate(`/search/results?query=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={JA.screens.home}
        description={JA.descriptions.home}
      />

      <section className="quick-search">
        <form onSubmit={handleSearch}>
          <label htmlFor="home-search">{JA.labels.searchKeyword}</label>
          <div className="search-row">
            <input
              id="home-search"
              type="search"
              value={query}
              placeholder={JA.placeholders.search}
              onChange={(event) => setQuery(event.target.value)}
            />
            <PrimaryButton type="submit" aria-label={JA.actions.searchDocuments}>
              <Search size={18} aria-hidden="true" />
            </PrimaryButton>
          </div>
        </form>
      </section>

      <section className="stats-grid">
        <div className="stat-panel">
          <Database size={21} aria-hidden="true" />
          <span>{JA.labels.documentCount}</span>
          <strong>{documents.length}</strong>
        </div>
        <Link className="stat-panel link-panel" to="/import">
          <UploadCloud size={21} aria-hidden="true" />
          <span>{JA.actions.importFiles}</span>
          <strong>追加</strong>
        </Link>
      </section>

      <section className="action-row">
        <Link className="button primary link-button" to="/import">
          {JA.actions.importFiles}
        </Link>
        <Link className="button secondary link-button" to="/documents">
          {JA.actions.viewDocuments}
        </Link>
      </section>

      <section>
        <div className="section-heading">
          <h2>{JA.labels.recentDocuments}</h2>
          <Link to="/documents">{JA.actions.viewDocuments}</Link>
        </div>
        {documents.length ? (
          <div className="card-list">
            {documents.slice(0, 3).map((document) => (
              <DocumentCard key={document.documentId} document={document} />
            ))}
          </div>
        ) : (
          <EmptyState title={JA.messages.noDocuments} />
        )}
      </section>
    </div>
  );
}
