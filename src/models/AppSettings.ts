export interface AppSettings {
  id: "app";
  searchHistory: string[];
  snippetBeforeChars: number;
  snippetAfterChars: number;
  pdfOcrLanguage?: "jpn" | "jpn+eng";
  lastIndexRebuiltAt?: string;
  createdAt: string;
  updatedAt: string;
}
