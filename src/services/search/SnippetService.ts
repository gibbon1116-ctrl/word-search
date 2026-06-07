import type { ExtractedChunk } from "../../models/ExtractedChunk";
import type { HighlightRange, SearchResult } from "../../models/SearchResult";
import { createId } from "../../utils/textUtils";

export interface SnippetOptions {
  snippetBeforeChars?: number;
  snippetAfterChars?: number;
  maxMatchesPerChunk?: number;
}

interface MatchLocation {
  localStart: number;
  localEnd: number;
  keyword: string;
}

export class SnippetService {
  createResultsForChunk(params: {
    fileName: string;
    fileType: string;
    chunks: ExtractedChunk[];
    chunk: ExtractedChunk;
    keywords: string[];
    options?: SnippetOptions;
  }): SearchResult[] {
    const beforeChars = params.options?.snippetBeforeChars ?? 100;
    const afterChars = params.options?.snippetAfterChars ?? 100;
    const maxMatches = params.options?.maxMatchesPerChunk ?? 3;
    const fullText = params.chunks.map((chunk) => chunk.text).join("\n\n");
    const matches = findMatches(params.chunk.text, params.keywords).slice(0, maxMatches);

    if (!matches.length) {
      const fallbackSnippet = params.chunk.text.slice(0, beforeChars + afterChars);
      return [{
        resultId: createId("result_fuzzy"),
        documentId: params.chunk.documentId,
        chunkId: params.chunk.chunkId,
        fileName: params.fileName,
        fileType: params.fileType,
        matchedText: params.keywords[0] ?? "",
        snippetBefore: "",
        snippetAfter: fallbackSnippet,
        snippet: `${fallbackSnippet}${params.chunk.text.length > fallbackSnippet.length ? "..." : ""}`,
        matchStart: params.chunk.startOffset,
        matchEnd: params.chunk.startOffset,
        pageNumber: params.chunk.pageNumber,
        sheetName: params.chunk.sheetName,
        rowNumber: params.chunk.rowNumber,
        cellRange: params.chunk.cellRange,
        heading: params.chunk.heading,
        metadata: {
          ...params.chunk.metadata,
          hasLeadingEllipsis: false,
          hasTrailingEllipsis: params.chunk.text.length > fallbackSnippet.length,
          centeredKeyword: params.keywords[0] ?? "",
          chunkIndex: params.chunk.chunkIndex,
          fuzzySearchHit: true,
        },
        highlightRanges: [],
        hasLeadingEllipsis: false,
        hasTrailingEllipsis: params.chunk.text.length > fallbackSnippet.length,
        score: 0.55,
      }];
    }

    return matches.map((match, index) => {
      const globalStart = params.chunk.startOffset + match.localStart;
      const globalEnd = params.chunk.startOffset + match.localEnd;
      const snippetStart = Math.max(0, globalStart - beforeChars);
      const snippetEnd = Math.min(fullText.length, globalEnd + afterChars);
      const hasLeadingEllipsis = snippetStart > 0;
      const hasTrailingEllipsis = snippetEnd < fullText.length;
      const prefix = hasLeadingEllipsis ? "..." : "";
      const suffix = hasTrailingEllipsis ? "..." : "";
      const snippetBefore = fullText.slice(snippetStart, globalStart);
      const matchedText = fullText.slice(globalStart, globalEnd);
      const snippetAfter = fullText.slice(globalEnd, snippetEnd);
      const snippet = `${prefix}${snippetBefore}${matchedText}${snippetAfter}${suffix}`;
      const highlightStart = prefix.length + snippetBefore.length;
      const highlightRanges: HighlightRange[] = [
        {
          start: highlightStart,
          end: highlightStart + matchedText.length,
        },
        ...findMatches(`${snippetBefore}${matchedText}${snippetAfter}`, params.keywords)
          .map((snippetMatch) => ({
            start: prefix.length + snippetMatch.localStart,
            end: prefix.length + snippetMatch.localEnd,
          }))
          .filter((range) => range.start !== highlightStart || range.end !== highlightStart + matchedText.length),
      ];

      return {
        resultId: createId(`result_${index}`),
        documentId: params.chunk.documentId,
        chunkId: params.chunk.chunkId,
        fileName: params.fileName,
        fileType: params.fileType,
        matchedText,
        snippetBefore,
        snippetAfter,
        snippet,
        matchStart: globalStart,
        matchEnd: globalEnd,
        pageNumber: params.chunk.pageNumber,
        sheetName: params.chunk.sheetName,
        rowNumber: params.chunk.rowNumber,
        cellRange: params.chunk.cellRange,
        heading: params.chunk.heading,
        metadata: {
          ...params.chunk.metadata,
          hasLeadingEllipsis,
          hasTrailingEllipsis,
          centeredKeyword: match.keyword,
          chunkIndex: params.chunk.chunkIndex,
        },
        highlightRanges: mergeRanges(highlightRanges),
        hasLeadingEllipsis,
        hasTrailingEllipsis,
        score: 1,
      };
    });
  }
}

function findMatches(text: string, keywords: string[]): MatchLocation[] {
  const lowerText = text.toLocaleLowerCase("ja-JP");
  const matches: MatchLocation[] = [];
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLocaleLowerCase("ja-JP");
    if (!normalizedKeyword) continue;
    let cursor = 0;
    while (cursor < lowerText.length) {
      const found = lowerText.indexOf(normalizedKeyword, cursor);
      if (found < 0) break;
      matches.push({ localStart: found, localEnd: found + normalizedKeyword.length, keyword });
      cursor = found + Math.max(normalizedKeyword.length, 1);
    }
  }
  return matches.sort((a, b) => a.localStart - b.localStart || b.localEnd - a.localEnd);
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = ranges
    .filter((range) => range.start >= 0 && range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }
  return merged;
}
