import type { HighlightRange } from "../../models/SearchResult";

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export class HighlightService {
  split(text: string, ranges: HighlightRange[]): HighlightSegment[] {
    const sorted = ranges
      .filter((range) => range.start >= 0 && range.end > range.start && range.start < text.length)
      .map((range) => ({ start: range.start, end: Math.min(range.end, text.length) }))
      .sort((a, b) => a.start - b.start);

    const segments: HighlightSegment[] = [];
    let cursor = 0;
    for (const range of sorted) {
      if (range.start > cursor) {
        segments.push({ text: text.slice(cursor, range.start), highlighted: false });
      }
      segments.push({ text: text.slice(range.start, range.end), highlighted: true });
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), highlighted: false });
    }
    return segments.filter((segment) => segment.text.length > 0);
  }
}

export const highlightService = new HighlightService();
