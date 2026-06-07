import { getAllDocuments, getChunksByDocument, saveSearchHistory } from "../../db/documentDb";
import type { DocumentRecord } from "../../models/DocumentRecord";
import type { SearchCriteria, SearchResult } from "../../models/SearchResult";
import { createId, normalizeForSearch, splitKeywords } from "../../utils/textUtils";
import { SnippetService } from "./SnippetService";

export class SearchService {
  private readonly snippetService = new SnippetService();

  async search(criteria: SearchCriteria): Promise<SearchResult[]> {
    const keywords = splitKeywords(criteria.query);
    if (!keywords.length) return [];

    const documents = await getAllDocuments();
    const filteredDocuments = documents.filter((document) => matchesDocumentFilters(document, criteria));
    const results: SearchResult[] = [];

    for (const document of filteredDocuments) {
      const chunks = await getChunksByDocument(document.documentId);
      for (const chunk of chunks) {
        const normalizedTarget = normalizeForSearch([document.fileName, chunk.heading, chunk.text].filter(Boolean).join("\n"));
        if (!keywords.every((keyword) => normalizedTarget.includes(keyword))) {
          continue;
        }
        const chunkResults = this.snippetService.createResultsForChunk({
          fileName: document.fileName,
          fileType: document.fileType,
          chunks,
          chunk,
          keywords,
          options: {
            snippetBeforeChars: criteria.snippetBeforeChars,
            snippetAfterChars: criteria.snippetAfterChars,
          },
        });
        results.push(...chunkResults);
      }
    }

    const sorted = results.sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName, "ja-JP"));
    const limited = sorted.slice(0, criteria.limit ?? 200);
    await saveSearchHistory({
      id: createId("history"),
      query: criteria.query,
      fileType: criteria.fileType,
      searchedAt: new Date().toISOString(),
      resultCount: limited.length,
    });
    return limited;
  }
}

function matchesDocumentFilters(document: DocumentRecord, criteria: SearchCriteria): boolean {
  if (criteria.fileType && criteria.fileType !== "all" && document.fileType !== criteria.fileType) {
    return false;
  }
  if (criteria.fileName && !normalizeForSearch(document.fileName).includes(normalizeForSearch(criteria.fileName))) {
    return false;
  }
  return true;
}

export const searchService = new SearchService();
