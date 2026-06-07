export interface SearchCriteria {
  query: string;
  fileType?: string;
  fileName?: string;
  limit?: number;
  snippetBeforeChars?: number;
  snippetAfterChars?: number;
}

export interface HighlightRange {
  start: number;
  end: number;
}

export interface SearchResult {
  resultId: string;
  documentId: string;
  chunkId: string;
  fileName: string;
  fileType: string;
  matchedText: string;
  snippetBefore: string;
  snippetAfter: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  pageNumber?: number;
  sheetName?: string;
  rowNumber?: number;
  cellRange?: string;
  heading?: string;
  metadata: Record<string, unknown>;
  highlightRanges: HighlightRange[];
  hasLeadingEllipsis: boolean;
  hasTrailingEllipsis: boolean;
  score: number;
}

export interface SearchIndexRecord {
  chunkId: string;
  documentId: string;
  fileName: string;
  fileType: string;
  normalizedText: string;
  updatedAt: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  fileType?: string;
  searchedAt: string;
  resultCount: number;
}
