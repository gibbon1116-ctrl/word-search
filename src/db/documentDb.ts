import type { AppSettings } from "../models/AppSettings";
import type { DocumentRecord } from "../models/DocumentRecord";
import type { ExtractedChunk } from "../models/ExtractedChunk";
import type { SearchHistoryItem, SearchIndexRecord } from "../models/SearchResult";

const DB_NAME = "LocalDocumentSearchPWA";
const DB_VERSION = 1;

export const STORES = {
  documents: "documents",
  chunks: "chunks",
  searchIndex: "searchIndex",
  importHistory: "importHistory",
  appSettings: "appSettings",
  searchHistory: "searchHistory",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export interface ImportHistoryRecord {
  id: string;
  fileName: string;
  fileType: string;
  importedAt: string;
  status: "success" | "failed";
  message?: string;
}

export function openDocumentDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.documents)) {
          const store = db.createObjectStore(STORES.documents, { keyPath: "documentId" });
          store.createIndex("fileType", "fileType");
          store.createIndex("fileName", "fileName");
          store.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains(STORES.chunks)) {
          const store = db.createObjectStore(STORES.chunks, { keyPath: "chunkId" });
          store.createIndex("documentId", "documentId");
          store.createIndex("documentIdChunkIndex", ["documentId", "chunkIndex"]);
        }
        if (!db.objectStoreNames.contains(STORES.searchIndex)) {
          const store = db.createObjectStore(STORES.searchIndex, { keyPath: "chunkId" });
          store.createIndex("documentId", "documentId");
          store.createIndex("fileType", "fileType");
        }
        if (!db.objectStoreNames.contains(STORES.importHistory)) {
          const store = db.createObjectStore(STORES.importHistory, { keyPath: "id" });
          store.createIndex("importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains(STORES.appSettings)) {
          db.createObjectStore(STORES.appSettings, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORES.searchHistory)) {
          const store = db.createObjectStore(STORES.searchHistory, { keyPath: "id" });
          store.createIndex("searchedAt", "searchedAt");
        }
      };
    });
  }
  return dbPromise;
}

export async function putMany<T>(storeName: string, values: T[]): Promise<void> {
  const db = await openDocumentDb();
  await transactionPromise(db, [storeName], "readwrite", (stores) => {
    for (const value of values) {
      stores[0].put(value);
    }
  });
}

export async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDocumentDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T[]);
  });
}

export async function getDocument(documentId: string): Promise<DocumentRecord | undefined> {
  return getByKey<DocumentRecord>(STORES.documents, documentId);
}

export async function getChunk(chunkId: string): Promise<ExtractedChunk | undefined> {
  return getByKey<ExtractedChunk>(STORES.chunks, chunkId);
}

export async function saveChunk(chunk: ExtractedChunk): Promise<void> {
  await putMany(STORES.chunks, [chunk]);
}

export async function getAllDocuments(): Promise<DocumentRecord[]> {
  const documents = await getAllFromStore<DocumentRecord>(STORES.documents);
  return documents.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function getChunksByDocument(documentId: string): Promise<ExtractedChunk[]> {
  const db = await openDocumentDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORES.chunks, "readonly")
      .objectStore(STORES.chunks)
      .index("documentId")
      .getAll(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () =>
      resolve((request.result as ExtractedChunk[]).sort((a, b) => a.chunkIndex - b.chunkIndex));
  });
}

export async function saveDocumentWithChunks(
  document: DocumentRecord,
  chunks: ExtractedChunk[],
  searchIndex: SearchIndexRecord[],
  history: ImportHistoryRecord,
): Promise<void> {
  const db = await openDocumentDb();
  await transactionPromise(db, [STORES.documents, STORES.chunks, STORES.searchIndex, STORES.importHistory], "readwrite", (stores) => {
    stores[0].put(document);
    for (const chunk of chunks) stores[1].put(chunk);
    for (const index of searchIndex) stores[2].put(index);
    stores[3].put(history);
  });
}

export async function deleteDocument(documentId: string): Promise<void> {
  const chunks = await getChunksByDocument(documentId);
  const db = await openDocumentDb();
  await transactionPromise(db, [STORES.documents, STORES.chunks, STORES.searchIndex], "readwrite", (stores) => {
    stores[0].delete(documentId);
    for (const chunk of chunks) {
      stores[1].delete(chunk.chunkId);
      stores[2].delete(chunk.chunkId);
    }
  });
}

export async function deleteAllDocuments(): Promise<void> {
  const db = await openDocumentDb();
  await transactionPromise(db, [STORES.documents, STORES.chunks, STORES.searchIndex, STORES.importHistory], "readwrite", (stores) => {
    for (const store of stores) store.clear();
  });
}

export async function saveSearchHistory(item: SearchHistoryItem): Promise<void> {
  await putMany(STORES.searchHistory, [item]);
}

export async function saveImportHistory(item: ImportHistoryRecord): Promise<void> {
  await putMany(STORES.importHistory, [item]);
}

export async function getSearchHistory(limit = 20): Promise<SearchHistoryItem[]> {
  const items = await getAllFromStore<SearchHistoryItem>(STORES.searchHistory);
  return items.sort((a, b) => b.searchedAt.localeCompare(a.searchedAt)).slice(0, limit);
}

export async function clearSearchHistory(): Promise<void> {
  const db = await openDocumentDb();
  await transactionPromise(db, [STORES.searchHistory], "readwrite", ([store]) => store.clear());
}

export async function getAppSettings(): Promise<AppSettings> {
  const existing = await getByKey<AppSettings>(STORES.appSettings, "app");
  if (existing) return existing;
  const now = new Date().toISOString();
  const settings: AppSettings = {
    id: "app",
    searchHistory: [],
    snippetBeforeChars: 100,
    snippetAfterChars: 100,
    pdfOcrLanguage: "jpn+eng",
    createdAt: now,
    updatedAt: now,
  };
  await putMany(STORES.appSettings, [settings]);
  return settings;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await putMany(STORES.appSettings, [{ ...settings, updatedAt: new Date().toISOString() }]);
}

export async function getStorageSummary(): Promise<{ documentCount: number; chunkCount: number; indexCount: number }> {
  const [documents, chunks, index] = await Promise.all([
    getAllFromStore<DocumentRecord>(STORES.documents),
    getAllFromStore<ExtractedChunk>(STORES.chunks),
    getAllFromStore<SearchIndexRecord>(STORES.searchIndex),
  ]);
  return { documentCount: documents.length, chunkCount: chunks.length, indexCount: index.length };
}

async function getByKey<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDocumentDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
}

function transactionPromise(
  db: IDBDatabase,
  storeNames: string[],
  mode: IDBTransactionMode,
  callback: (stores: IDBObjectStore[]) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    callback(storeNames.map((name) => tx.objectStore(name)));
  });
}
