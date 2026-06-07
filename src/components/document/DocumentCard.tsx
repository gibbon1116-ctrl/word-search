import { ChevronRight, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { JA } from "../../i18n/ja";
import type { DocumentRecord } from "../../models/DocumentRecord";
import { formatDateTime } from "../../utils/dateUtils";
import { formatBytes } from "../../utils/fileUtils";

export function DocumentCard({
  document,
  onDelete,
}: {
  document: DocumentRecord;
  onDelete?: (documentId: string) => void;
}) {
  return (
    <article className="record-card">
      <div className="record-card-main">
        <span className="file-type">{document.fileType}</span>
        <h2>{document.fileName}</h2>
        <div className="compact-meta">
          <span>{formatBytes(document.fileSize)}</span>
          <span>{formatDateTime(document.importedAt)}</span>
          <span>{document.chunkCount} チャンク</span>
        </div>
      </div>
      <div className="record-actions">
        {onDelete ? (
          <button className="icon-button danger" type="button" onClick={() => onDelete(document.documentId)} aria-label="資料を削除">
            <Trash2 size={18} />
          </button>
        ) : null}
        <Link className="icon-button" to={`/documents/${document.documentId}`} aria-label={`${document.fileName}の詳細を見る`}>
          <ChevronRight size={20} />
          <span className="sr-only">{JA.actions.openDetail}</span>
        </Link>
      </div>
    </article>
  );
}
