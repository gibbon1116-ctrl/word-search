import { FolderOpen, UploadCloud } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImportStatusList } from "../components/fileImport/ImportStatusList";
import { PageHeader } from "../components/common/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { JA } from "../i18n/ja";
import { ACCEPT_ATTRIBUTE } from "../utils/fileUtils";
import { importService, type ImportProgress, type ImportResult } from "../services/import/ImportService";

export function FileImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ImportProgress>();
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setIsImporting(true);
    setResults([]);
    try {
      const importResults = await importService.importFiles(files, setProgress);
      setResults(importResults);
    } finally {
      setIsImporting(false);
      setProgress(undefined);
      event.target.value = "";
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={JA.screens.import}
        description={JA.descriptions.import}
      />

      <section className="import-panel">
        <input
          ref={inputRef}
          className="visually-hidden-input"
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          onChange={handleFiles}
        />
        <FolderOpen size={38} aria-hidden="true" />
        <h2>{JA.descriptions.chooseDocuments}</h2>
        <p>{JA.descriptions.chooseDocumentsHelp}</p>
        <PrimaryButton type="button" onClick={() => inputRef.current?.click()} disabled={isImporting}>
          <UploadCloud size={18} aria-hidden="true" />
          {isImporting ? "登録処理中です" : JA.actions.chooseFiles}
        </PrimaryButton>
      </section>

      <section className="info-section">
        <h2>対応形式一覧</h2>
        <div className="format-grid">
          {JA.formats.map((format) => (
            <span key={format}>{format}</span>
          ))}
        </div>
      </section>

      <ImportStatusList progress={progress} results={results} />

      {results.length ? (
        <Link className="button secondary link-button" to="/documents">
          {JA.messages.confirmImportList}
        </Link>
      ) : null}
    </div>
  );
}
