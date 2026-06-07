import { Ban, FolderOpen, UploadCloud } from "lucide-react";
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
  const [usePdfOcr, setUsePdfOcr] = useState(false);
  const [pdfOcrTestOnly, setPdfOcrTestOnly] = useState(false);
  const abortControllerRef = useRef<AbortController>();

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsImporting(true);
    setResults([]);
    try {
      const importResults = await importService.importFiles(files, setProgress, {
        signal: abortController.signal,
        usePdfOcr,
        pdfOcrTestOnly,
      });
      setResults(importResults);
    } finally {
      setIsImporting(false);
      setProgress(undefined);
      abortControllerRef.current = undefined;
      event.target.value = "";
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
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
        <div className="option-stack">
          <label className="check-option">
            <input
              type="checkbox"
              checked={usePdfOcr}
              disabled={isImporting}
              onChange={(event) => setUsePdfOcr(event.target.checked)}
            />
            <span>PDFで文字が読めない場合はOCRを使って登録する</span>
          </label>
          <label className="check-option">
            <input
              type="checkbox"
              checked={pdfOcrTestOnly}
              disabled={isImporting || !usePdfOcr}
              onChange={(event) => setPdfOcrTestOnly(event.target.checked)}
            />
            <span>テストOCRとして先頭3ページだけ登録する</span>
          </label>
          {usePdfOcr ? (
            <p className="helper-text">
              OCRは時間がかかります。長大PDFではiPhoneのバッテリーと保存容量に注意してください。OCR用データは必要時だけ読み込みます。
            </p>
          ) : null}
        </div>
        <PrimaryButton type="button" onClick={() => inputRef.current?.click()} disabled={isImporting}>
          <UploadCloud size={18} aria-hidden="true" />
          {isImporting ? "登録処理中です" : JA.actions.chooseFiles}
        </PrimaryButton>
        {isImporting ? (
          <button className="button secondary" type="button" onClick={handleCancel}>
            <Ban size={18} aria-hidden="true" />
            キャンセル
          </button>
        ) : null}
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
