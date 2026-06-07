import { useEffect, useMemo, useState } from "react";
import { DocumentCard } from "../components/document/DocumentCard";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { JA } from "../i18n/ja";
import type { DocumentRecord } from "../models/DocumentRecord";
import { storageService } from "../services/storage/StorageService";
import { normalizeForSearch } from "../utils/textUtils";

export function DocumentListPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [fileType, setFileType] = useState("all");
  const [fileName, setFileName] = useState("");

  async function refresh() {
    setDocuments(await storageService.getAllDocuments());
  }

  useEffect(() => {
    refresh().catch(() => setDocuments([]));
  }, []);

  const fileTypes = useMemo(() => Array.from(new Set(documents.map((document) => document.fileType))), [documents]);
  const filtered = documents.filter((document) => {
    const typeMatches = fileType === "all" || document.fileType === fileType;
    const nameMatches = !fileName || normalizeForSearch(document.fileName).includes(normalizeForSearch(fileName));
    return typeMatches && nameMatches;
  });

  async function handleDelete(documentId: string) {
    if (!window.confirm(JA.confirm.deleteDocument)) return;
    await storageService.deleteDocument(documentId);
    await refresh();
  }

  return (
    <div className="page-stack">
      <PageHeader title={JA.screens.documents} description={JA.descriptions.documents} />

      <section className="filter-panel">
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
        <PrimaryButton
          type="button"
          variant="ghost"
          onClick={() => {
            setFileType("all");
            setFileName("");
          }}
        >
          {JA.actions.clearFilters}
        </PrimaryButton>
      </section>

      {filtered.length ? (
        <div className="card-list">
          {filtered.map((document) => (
            <DocumentCard key={document.documentId} document={document} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <EmptyState title={documents.length ? JA.messages.noFilteredDocuments : JA.messages.noDocuments} />
      )}
    </div>
  );
}
