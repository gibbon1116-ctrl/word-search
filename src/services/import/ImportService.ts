import { saveDocumentWithChunks, saveImportHistory, type ImportHistoryRecord } from "../../db/documentDb";
import { createSearchIndexRecords } from "../../db/searchIndexDb";
import type { DocumentRecord } from "../../models/DocumentRecord";
import type { ExtractedDocument } from "../../models/ExtractedDocument";
import { getReadableFileType, isSupportedFile } from "../../utils/fileUtils";
import { createId } from "../../utils/textUtils";
import { extractorRegistry } from "../extractors/ExtractorRegistry";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface ImportProgress {
  fileName: string;
  current: number;
  total: number;
  status: "pending" | "processing" | "success" | "failed";
  message: string;
}

export interface ImportResult {
  fileName: string;
  fileType: string;
  status: "success" | "failed";
  message: string;
  documentId?: string;
}

export class ImportService {
  async importFiles(files: File[], onProgress?: (progress: ImportProgress) => void): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress?.({
        fileName: file.name,
        current: index + 1,
        total: files.length,
        status: "processing",
        message: "本文を抽出しています。",
      });

      try {
        if (!isSupportedFile(file)) {
          throw new Error("このファイル形式には対応していません。対応形式一覧を確認してください。");
        }
        if (file.size > MAX_FILE_BYTES) {
          throw new Error("ファイルサイズが大きすぎます。100MB以下のファイルを選択してください。");
        }
        const extracted = await extractorRegistry.getExtractor(file).extract(file);
        await saveExtractedDocument(extracted);
        results.push({
          fileName: file.name,
          fileType: extracted.fileType,
          status: "success",
          message: "登録が完了しました。",
          documentId: extracted.documentId,
        });
        onProgress?.({
          fileName: file.name,
          current: index + 1,
          total: files.length,
          status: "success",
          message: "登録が完了しました。",
        });
      } catch (error) {
        const message = normalizeImportError(error);
        const fileType = getReadableFileType(file.name, file.type);
        const history: ImportHistoryRecord = {
          id: createId("import"),
          fileName: file.name,
          fileType,
          importedAt: new Date().toISOString(),
          status: "failed",
          message,
        };
        try {
          await saveImportHistory(history);
        } catch {
          // 履歴保存に失敗しても、他のファイル処理は継続します。
        }
        results.push({ fileName: file.name, fileType, status: "failed", message });
        onProgress?.({
          fileName: file.name,
          current: index + 1,
          total: files.length,
          status: "failed",
          message,
        });
      }
    }
    return results;
  }
}

async function saveExtractedDocument(extracted: ExtractedDocument): Promise<void> {
  const record: DocumentRecord = {
    documentId: extracted.documentId,
    fileName: extracted.fileName,
    fileType: extracted.fileType,
    fileSize: extracted.fileSize,
    importedAt: extracted.importedAt,
    updatedAt: extracted.updatedAt,
    chunkCount: extracted.chunks.length,
    sourceType: inferSourceType(extracted.fileName),
    metadata: {
      title: extracted.title,
      ...extracted.metadata,
    },
  };
  const searchIndex = createSearchIndexRecords(record, extracted.chunks);
  const history: ImportHistoryRecord = {
    id: createId("import"),
    fileName: extracted.fileName,
    fileType: extracted.fileType,
    importedAt: extracted.importedAt,
    status: "success",
    message: "登録が完了しました。",
  };
  await saveDocumentWithChunks(record, extracted.chunks, searchIndex, history);
}

function normalizeImportError(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "保存容量が不足している可能性があります。不要な資料を削除してから再度お試しください。";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "ファイルの登録中にエラーが発生しました。ファイルが破損していないか確認してください。";
}

function inferSourceType(_fileName: string): DocumentRecord["sourceType"] {
  return "unknown";
}

export const importService = new ImportService();
