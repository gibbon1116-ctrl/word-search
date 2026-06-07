import { Route, Routes } from "react-router-dom";
import { DocumentDetailPage } from "../pages/DocumentDetailPage";
import { DocumentListPage } from "../pages/DocumentListPage";
import { FileImportPage } from "../pages/FileImportPage";
import { HomePage } from "../pages/HomePage";
import { SearchPage } from "../pages/SearchPage";
import { SearchResultsPage } from "../pages/SearchResultsPage";
import { SettingsPage } from "../pages/SettingsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/import" element={<FileImportPage />} />
      <Route path="/documents" element={<DocumentListPage />} />
      <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/search/results" element={<SearchResultsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
