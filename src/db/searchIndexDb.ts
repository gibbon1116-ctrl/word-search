import type { DocumentRecord } from "../models/DocumentRecord";
import type { ExtractedChunk } from "../models/ExtractedChunk";
import type { SearchIndexRecord } from "../models/SearchResult";
import { normalizeForSearch } from "../utils/textUtils";
import { getAllDocuments, getChunksByDocument, openDocumentDb, STORES } from "./documentDb";

export function createSearchIndexRecords(document: DocumentRecord, chunks: ExtractedChunk[]): SearchIndexRecord[] {
  const now = new Date().toISOString();
  return chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    documentId: document.documentId,
    fileName: document.fileName,
    fileType: document.fileType,
    normalizedText: normalizeForSearch([document.fileName, document.fileType, chunk.heading, chunk.text].filter(Boolean).join("\n")),
    updatedAt: now,
  }));
}

export async function getAllSearchIndexRecords(): Promise<SearchIndexRecord[]> {
  const db = await openDocumentDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORES.searchIndex, "readonly").objectStore(STORES.searchIndex).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as SearchIndexRecord[]);
  });
}

export async function rebuildSearchIndex(): Promise<number> {
  const documents = await getAllDocuments();
  const db = await openDocumentDb();
  const allRecords: SearchIndexRecord[] = [];
  for (const document of documents) {
    const chunks = await getChunksByDocument(document.documentId);
    allRecords.push(...createSearchIndexRecords(document, chunks));
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.searchIndex, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORES.searchIndex);
    store.clear();
    for (const record of allRecords) {
      store.put(record);
    }
  });

  return allRecords.length;
}
