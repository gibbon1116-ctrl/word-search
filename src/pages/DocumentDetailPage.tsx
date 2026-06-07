import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/common/EmptyState";
import { MetaRow } from "../components/common/MetaRow";
import { PageHeader } from "../components/common/PageHeader";
import { JA } from "../i18n/ja";
import type { DocumentRecord } from "../models/DocumentRecord";
import type { ExtractedChunk } from "../models/ExtractedChunk";
import { storageService } from "../services/storage/StorageService";
import { formatDateTime } from "../utils/dateUtils";
import { formatBytes } from "../utils/fileUtils";
import { normalizeForSearch } from "../utils/textUtils";

export function DocumentDetailPage() {
  const { documentId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const selectedChunkId = searchParams.get("chunkId");
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
      document.getElementById(selectedChunkId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [selectedChunkId, chunks.length]);

  const filteredChunks = useMemo(() => {
    if (!chunkQuery.trim()) return chunks;
    const normalized = normalizeForSearch(chunkQuery);
    return chunks.filter((chunk) => normalizeForSearch(`${chunk.heading ?? ""}\n${chunk.text}`).includes(normalized));
  }, [chunkQuery, chunks]);

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
              <pre>{chunk.text}</pre>
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
