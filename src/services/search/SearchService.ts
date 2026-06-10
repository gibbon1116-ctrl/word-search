import { getAllDocuments, getChunksByDocument, saveSearchHistory } from "../../db/documentDb";
import type { ExtractedChunk } from "../../models/ExtractedChunk";
import type { DocumentRecord } from "../../models/DocumentRecord";
import type { SearchCriteria, SearchDocumentSummary, SearchResult, SearchTermSummary } from "../../models/SearchResult";
import { createId, normalizeForSearch, splitKeywords } from "../../utils/textUtils";
import { SnippetService } from "./SnippetService";

export class SearchService {
  private readonly snippetService = new SnippetService();

  async search(criteria: SearchCriteria): Promise<SearchResult[]> {
    const results = await this.collectSearchResults(criteria);
    const limited = results.slice(0, criteria.limit ?? 200);
    await saveSearchHistory({
      id: createId("history"),
      query: criteria.query,
      fileType: criteria.fileType,
      searchedAt: new Date().toISOString(),
      resultCount: limited.length,
    });
    return limited;
  }

  async searchGroupedByDocument(criteria: SearchCriteria): Promise<SearchDocumentSummary[]> {
    const results = await this.collectSearchResults({ ...criteria, limit: undefined });
    const documents = await getAllDocuments();
    const documentById = new Map(documents.map((document) => [document.documentId, document]));
    const filteredDocuments = documents.filter((document) => matchesDocumentFilters(document, criteria));
    const keywords = splitKeywords(criteria.query);
    const grouped = new Map<string, SearchDocumentSummaryDraft>();
    const titleMatchedDocumentIds = new Set(
      filteredDocuments
        .filter((document) => matchesDocumentTitle(document, keywords))
        .map((document) => document.documentId),
    );

    for (const result of results) {
      const document = documentById.get(result.documentId);
      const draft = grouped.get(result.documentId) ?? createSummaryDraft(result, document);
      draft.totalHitCount += 1;
      draft.contentHitCount += 1;
      draft.chunkIds.add(result.chunkId);
      if (result.pageNumber !== undefined) draft.pageNumbers.add(result.pageNumber);
      if (result.sheetName) draft.sheetNames.add(result.sheetName);
      if (result.heading) draft.headings.add(result.heading);
      for (const keyword of keywords) {
        draft.terms.add(keyword);
      }
      if (!draft.topSnippet || result.score > draft.maxScore) {
        draft.topSnippet = result.snippet;
      }
      draft.ocrUsed ||= result.metadata.ocrUsed === true;
      const confidence = getNumberMetadata(result.metadata, "ocrConfidence");
      if (confidence !== undefined) {
        draft.minOcrConfidence = draft.minOcrConfidence === undefined ? confidence : Math.min(draft.minOcrConfidence, confidence);
      }
      draft.maxScore = Math.max(draft.maxScore, result.score);
      grouped.set(result.documentId, draft);
    }

    for (const documentId of titleMatchedDocumentIds) {
      const document = documentById.get(documentId);
      if (!document) continue;
      const draft =
        grouped.get(documentId) ??
        createSummaryDraft(
          {
            documentId,
            fileName: document.fileName,
            fileType: document.fileType,
          },
          document,
        );
      draft.titleMatched = true;
      draft.titleMatchText = getDocumentTitle(document);
      draft.totalHitCount += 1;
      draft.maxScore = Math.max(draft.maxScore, 2);
      if (!draft.topSnippet) {
        draft.topSnippet = `タイトル: ${draft.titleMatchText}`;
      }
      grouped.set(documentId, draft);
    }

    return Array.from(grouped.values())
      .map((draft) => ({
        documentId: draft.documentId,
        fileName: draft.fileName,
        fileType: draft.fileType,
        importedAt: draft.importedAt,
        titleMatched: draft.titleMatched,
        titleMatchText: draft.titleMatchText,
        contentHitCount: draft.contentHitCount,
        totalHitCount: draft.totalHitCount,
        matchedChunkCount: draft.chunkIds.size,
        matchedPageNumbers: Array.from(draft.pageNumbers).sort((a, b) => a - b),
        matchedSheetNames: Array.from(draft.sheetNames).sort((a, b) => a.localeCompare(b, "ja-JP")),
        matchedHeadings: Array.from(draft.headings).slice(0, 12),
        matchedTerms: Array.from(draft.terms),
        topSnippet: draft.topSnippet,
        ocrUsed: draft.ocrUsed,
        minOcrConfidence: draft.minOcrConfidence,
        maxScore: draft.maxScore,
      }))
      .sort((a, b) => {
        if (a.titleMatched !== b.titleMatched) return a.titleMatched ? -1 : 1;
        return b.maxScore - a.maxScore || b.contentHitCount - a.contentHitCount || a.fileName.localeCompare(b.fileName, "ja-JP");
      });
  }

  async searchWithinDocument(criteria: SearchCriteria, documentId: string): Promise<SearchResult[]> {
    const documents = await getAllDocuments();
    const document = documents.find((item) => item.documentId === documentId);
    if (!document || !matchesDocumentFilters(document, criteria)) return [];
    const results = await this.collectSearchResultsForDocuments(criteria, [document]);
    return results.slice(0, criteria.limit ?? 500);
  }

  async getTermSummaryWithinDocument(criteria: SearchCriteria, documentId: string): Promise<SearchTermSummary[]> {
    const keywords = splitKeywords(criteria.query);
    if (!keywords.length) return [];
    const documents = await getAllDocuments();
    const document = documents.find((item) => item.documentId === documentId);
    if (!document || !matchesDocumentFilters(document, criteria)) return [];
    const chunks = await getChunksByDocument(documentId);

    return keywords
      .map((term) => createTermSummary(term, chunks, criteria))
      .filter((summary) => summary.hitCount > 0)
      .sort((a, b) => b.hitCount - a.hitCount || a.term.localeCompare(b.term, "ja-JP"));
  }

  private async collectSearchResults(criteria: SearchCriteria): Promise<SearchResult[]> {
    const keywords = splitKeywords(criteria.query);
    if (!keywords.length) return [];

    const documents = await getAllDocuments();
    const filteredDocuments = documents.filter((document) => matchesDocumentFilters(document, criteria));
    return this.collectSearchResultsForDocuments(criteria, filteredDocuments);
  }

  private async collectSearchResultsForDocuments(criteria: SearchCriteria, documents: DocumentRecord[]): Promise<SearchResult[]> {
    const keywords = splitKeywords(criteria.query);
    const results: SearchResult[] = [];

    for (const document of documents) {
      const chunks = await getChunksByDocument(document.documentId);
      for (const chunk of chunks) {
        const correctedSearchText =
          typeof chunk.metadata.correctedSearchText === "string" ? chunk.metadata.correctedSearchText : "";
        const originalOcrText =
          typeof chunk.metadata.originalOcrText === "string" ? chunk.metadata.originalOcrText : "";
        const normalizedTarget = normalizeForSearch([chunk.heading, correctedSearchText, originalOcrText, chunk.text].filter(Boolean).join("\n"));
        if (!keywords.every((keyword) => normalizedTarget.includes(keyword) || fuzzyKeywordMatch(normalizedTarget, keyword))) {
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

    return results.sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName, "ja-JP"));
  }
}

interface SearchDocumentSummaryDraft {
  documentId: string;
  fileName: string;
  fileType: string;
  importedAt: string;
  titleMatched: boolean;
  titleMatchText?: string;
  contentHitCount: number;
  totalHitCount: number;
  chunkIds: Set<string>;
  pageNumbers: Set<number>;
  sheetNames: Set<string>;
  headings: Set<string>;
  terms: Set<string>;
  topSnippet: string;
  ocrUsed: boolean;
  minOcrConfidence?: number;
  maxScore: number;
}

function createSummaryDraft(
  result: Pick<SearchResult, "documentId" | "fileName" | "fileType">,
  document?: DocumentRecord,
): SearchDocumentSummaryDraft {
  return {
    documentId: result.documentId,
    fileName: result.fileName,
    fileType: result.fileType,
    importedAt: document?.importedAt ?? "",
    titleMatched: false,
    contentHitCount: 0,
    totalHitCount: 0,
    chunkIds: new Set(),
    pageNumbers: new Set(),
    sheetNames: new Set(),
    headings: new Set(),
    terms: new Set(),
    topSnippet: "",
    ocrUsed: false,
    maxScore: 0,
  };
}

function createTermSummary(term: string, chunks: ExtractedChunk[], criteria: SearchCriteria): SearchTermSummary {
  const beforeChars = criteria.snippetBeforeChars ?? 100;
  const afterChars = criteria.snippetAfterChars ?? 100;
  const snippets: SearchTermSummary["snippets"] = [];
  const pageNumbers = new Set<number>();
  const chunkIds = new Set<string>();
  let hitCount = 0;

  for (const chunk of chunks) {
    const searchableText = getSearchableChunkText(chunk);
    const matches = findTermMatches(searchableText, term);
    if (!matches.length && !fuzzyKeywordMatch(normalizeForSearch(searchableText), term)) continue;
    const effectiveMatches = matches.length ? matches : [{ start: 0, end: Math.min(searchableText.length, term.length) }];
    hitCount += matches.length || 1;
    chunkIds.add(chunk.chunkId);
    if (chunk.pageNumber !== undefined) pageNumbers.add(chunk.pageNumber);

    for (const match of effectiveMatches.slice(0, 3)) {
      const snippetStart = Math.max(0, match.start - beforeChars);
      const snippetEnd = Math.min(searchableText.length, match.end + afterChars);
      const prefix = snippetStart > 0 ? "..." : "";
      const snippetText = searchableText.slice(snippetStart, snippetEnd);
      snippets.push({
        chunkId: chunk.chunkId,
        pageNumber: chunk.pageNumber,
        sheetName: chunk.sheetName,
        rowNumber: chunk.rowNumber,
        heading: chunk.heading,
        snippet: `${prefix}${snippetText}${snippetEnd < searchableText.length ? "..." : ""}`,
        highlightRanges: createSnippetHighlightRanges(searchableText, term, snippetStart, snippetEnd, prefix.length),
        score: matches.length ? 1 : 0.55,
      });
    }
  }

  return {
    term,
    hitCount,
    pageNumbers: Array.from(pageNumbers).sort((a, b) => a - b),
    chunkIds: Array.from(chunkIds),
    snippets,
  };
}

function getSearchableChunkText(chunk: ExtractedChunk): string {
  const correctedSearchText = typeof chunk.metadata.correctedSearchText === "string" ? chunk.metadata.correctedSearchText : "";
  const originalOcrText = typeof chunk.metadata.originalOcrText === "string" ? chunk.metadata.originalOcrText : "";
  return [chunk.heading, correctedSearchText, originalOcrText, chunk.text].filter(Boolean).join("\n");
}

function findTermMatches(text: string, term: string): Array<{ start: number; end: number }> {
  const lowerText = text.toLocaleLowerCase("ja-JP");
  const lowerTerm = term.toLocaleLowerCase("ja-JP");
  const matches: Array<{ start: number; end: number }> = [];
  if (!lowerTerm) return matches;
  let cursor = 0;
  while (cursor < lowerText.length) {
    const found = lowerText.indexOf(lowerTerm, cursor);
    if (found < 0) break;
    matches.push({ start: found, end: found + lowerTerm.length });
    cursor = found + Math.max(lowerTerm.length, 1);
  }
  return matches;
}

function createSnippetHighlightRanges(
  text: string,
  term: string,
  snippetStart: number,
  snippetEnd: number,
  prefixLength: number,
): Array<{ start: number; end: number }> {
  return findTermMatches(text.slice(snippetStart, snippetEnd), term).map((match) => ({
    start: prefixLength + match.start,
    end: prefixLength + match.end,
  }));
}

function getNumberMetadata(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function fuzzyKeywordMatch(target: string, keyword: string): boolean {
  const compactTarget = target.replace(/\s+/g, "");
  const compactKeyword = keyword.replace(/\s+/g, "");
  if (compactKeyword.length < 4) {
    return false;
  }
  const size = compactKeyword.length >= 6 ? 3 : 2;
  const grams: string[] = [];
  for (let index = 0; index <= compactKeyword.length - size; index += 1) {
    grams.push(compactKeyword.slice(index, index + size));
  }
  if (!grams.length) {
    return false;
  }
  const hits = grams.filter((gram) => compactTarget.includes(gram)).length;
  return hits / grams.length >= 0.72;
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

function matchesDocumentTitle(document: DocumentRecord, keywords: string[]): boolean {
  if (!keywords.length) {
    return false;
  }
  const normalizedTitle = normalizeForSearch(getDocumentTitle(document));
  return keywords.every((keyword) => normalizedTitle.includes(keyword) || fuzzyKeywordMatch(normalizedTitle, keyword));
}

function getDocumentTitle(document: DocumentRecord): string {
  const title = document.metadata.title;
  return typeof title === "string" && title.trim() ? title : document.fileName;
}

export const searchService = new SearchService();
