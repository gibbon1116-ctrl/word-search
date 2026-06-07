import {
  clearSearchHistory,
  deleteAllDocuments,
  deleteDocument,
  getAllDocuments,
  getAppSettings,
  getChunksByDocument,
  getSearchHistory,
  getStorageSummary,
  saveAppSettings,
} from "../../db/documentDb";
import { rebuildSearchIndex } from "../../db/searchIndexDb";

export const storageService = {
  getAllDocuments,
  getChunksByDocument,
  getSearchHistory,
  getStorageSummary,
  getAppSettings,
  saveAppSettings,
  deleteDocument,
  deleteAllDocuments,
  clearSearchHistory,
  rebuildSearchIndex,
};
