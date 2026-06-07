import type { HighlightRange } from "../../models/SearchResult";
import { highlightService } from "../../services/search/HighlightService";

export function SnippetText({ text, ranges }: { text: string; ranges: HighlightRange[] }) {
  const segments = highlightService.split(text, ranges);
  return (
    <span>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
