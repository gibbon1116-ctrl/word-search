import { CsvExtractor } from "./CsvExtractor";
import { ExcelExtractor } from "./ExcelExtractor";
import { HtmlExtractor } from "./HtmlExtractor";
import { JsonExtractor } from "./JsonExtractor";
import { MarkdownExtractor } from "./MarkdownExtractor";
import { PdfExtractor } from "./PdfExtractor";
import { TextExtractor } from "./TextExtractor";
import { WordDocxExtractor } from "./WordDocxExtractor";
import type { DocumentExtractor } from "./types";

export class ExtractorRegistry {
  private readonly extractors: DocumentExtractor[];

  constructor(extractors: DocumentExtractor[] = defaultExtractors) {
    this.extractors = extractors;
  }

  findExtractor(file: File): DocumentExtractor | undefined {
    return this.extractors.find((extractor) => extractor.canHandle(file));
  }

  getExtractor(file: File): DocumentExtractor {
    const extractor = this.findExtractor(file);
    if (!extractor) {
      throw new Error("このファイル形式には対応していません。対応形式一覧を確認してください。");
    }
    return extractor;
  }
}

export const defaultExtractors = [
  new PdfExtractor(),
  new MarkdownExtractor(),
  new CsvExtractor(),
  new ExcelExtractor(),
  new WordDocxExtractor(),
  new HtmlExtractor(),
  new JsonExtractor(),
  new TextExtractor(),
];

export const extractorRegistry = new ExtractorRegistry();
