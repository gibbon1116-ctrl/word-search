import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { getAllDocuments, getChunksByDocument, saveChunk } from "../db/documentDb";
import { rebuildSearchIndex } from "../db/searchIndexDb";
import { JA } from "../i18n/ja";
import type { DocumentRecord } from "../models/DocumentRecord";
import type { ExtractedChunk } from "../models/ExtractedChunk";

export function OcrReviewPage() {
  const { documentId = "" } = useParams();
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord>();
  const [chunks, setChunks] = useState<ExtractedChunk[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([getAllDocuments(), getChunksByDocument(documentId)]).then(([documents, nextChunks]) => {
      setDocumentRecord(documents.find((item) => item.documentId === documentId));
      setChunks(nextChunks);
      setDrafts(Object.fromEntries(nextChunks.map((chunk) => [chunk.chunkId, getDraftText(chunk)])));
    }).finally(() => setIsLoading(false));
  }, [documentId]);

  const ocrChunks = useMemo(
    () => chunks.filter((chunk) => chunk.chunkType === "pdf-page" && chunk.metadata.ocrUsed),
    [chunks],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    for (const chunk of ocrChunks) {
      await saveChunk({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          correctedSearchText: drafts[chunk.chunkId] ?? chunk.text,
          userCorrectedAt: new Date().toISOString(),
        },
      });
    }
    await rebuildSearchIndex();
    setMessage("修正内容を検索インデックスに反映しました。");
  }

  if (isLoading) {
    return <div className="page-stack"><PageHeader title="OCR結果確認" /><div className="status-banner">{JA.messages.loading}</div></div>;
  }

  if (!documentRecord) {
    return <div className="page-stack"><PageHeader title="OCR結果確認" /><EmptyState title={JA.messages.documentNotFound} /></div>;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="OCR結果確認"
        description={documentRecord.fileName}
        actions={<Link className="button secondary link-button" to={`/documents/${documentId}`}>{JA.actions.back}</Link>}
      />
      {message ? <div className="status-banner success">{message}</div> : null}
      {!ocrChunks.length ? (
        <EmptyState title="OCRで登録されたページがありません" description="PDF.jsの文字層で登録された資料、またはOCR未使用の資料です。" />
      ) : (
        <form className="ocr-review-list" onSubmit={handleSubmit}>
          {ocrChunks.map((chunk) => (
            <article className="chunk-card" key={chunk.chunkId}>
              <div className="chunk-meta">
                <span>{JA.labels.pageNumber}: {chunk.pageNumber}</span>
                {typeof chunk.metadata.ocrConfidence === "number" ? <span>OCR信頼度: {Math.round(chunk.metadata.ocrConfidence)}%</span> : null}
                {typeof chunk.metadata.ocrPreprocessMode === "string" ? <span>前処理: {chunk.metadata.ocrPreprocessMode}</span> : null}
              </div>
              <label>
                検索用の修正テキスト
                <textarea
                  value={drafts[chunk.chunkId] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [chunk.chunkId]: event.target.value }))}
                />
              </label>
              <details>
                <summary>OCR原文を表示</summary>
                <pre>{typeof chunk.metadata.originalOcrText === "string" ? chunk.metadata.originalOcrText : chunk.text}</pre>
              </details>
            </article>
          ))}
          <button className="button primary" type="submit">修正内容を検索に反映</button>
        </form>
      )}
    </div>
  );
}

function getDraftText(chunk: ExtractedChunk): string {
  return typeof chunk.metadata.correctedSearchText === "string" ? chunk.metadata.correctedSearchText : chunk.text;
}
