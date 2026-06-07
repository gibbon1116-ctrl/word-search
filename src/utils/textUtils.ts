export function createId(prefix: string): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])\s+([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/gu, "$1$2")
    .replace(/([a-z0-9])\s+([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/gu, "$1$2")
    .replace(/([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])\s+([a-z0-9])/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitKeywords(query: string): string[] {
  return normalizeForSearch(query)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function compactWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkText(text: string, maxLength = 1800): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }
    if (current.trim()) {
      chunks.push(current.trim());
    }
    if (paragraph.length <= maxLength) {
      current = paragraph;
      continue;
    }
    for (let index = 0; index < paragraph.length; index += maxLength) {
      chunks.push(paragraph.slice(index, index + maxLength).trim());
    }
    current = "";
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length ? chunks : [text.trim()].filter(Boolean);
}

export function assignChunkPositions<T extends { text: string }>(
  chunks: T[],
  separatorLength = 2,
): Array<T & { chunkIndex: number; startOffset: number; endOffset: number }> {
  let offset = 0;
  return chunks.map((chunk, chunkIndex) => {
    const startOffset = offset;
    const endOffset = startOffset + chunk.text.length;
    offset = endOffset + separatorLength;
    return {
      ...chunk,
      chunkIndex,
      startOffset,
      endOffset,
    };
  });
}

export function createSnippet(text: string, keywords: string[], radius = 80): string {
  const normalized = normalizeForSearch(text);
  const firstMatch = keywords
    .map((keyword) => normalized.indexOf(keyword))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return text.slice(0, radius * 2);
  }

  const start = Math.max(0, firstMatch - radius);
  const end = Math.min(text.length, firstMatch + radius);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}
