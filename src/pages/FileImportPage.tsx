import { Ban, FolderOpen, UploadCloud } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImportStatusList } from "../components/fileImport/ImportStatusList";
import { PageHeader } from "../components/common/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { JA } from "../i18n/ja";
import { ACCEPT_ATTRIBUTE } from "../utils/fileUtils";
import { importService, type ImportProgress, type ImportResult } from "../services/import/ImportService";
import { storageService } from "../services/storage/StorageService";

export function FileImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ImportProgress>();
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [pdfOcrMode, setPdfOcrMode] = useState<"off" | "auto" | "force" | "highAccuracy">("off");
  const [pdfOcrLanguage, setPdfOcrLanguage] = useState<"jpn" | "jpn+eng">("jpn+eng");
  const [pdfOcrTestOnly, setPdfOcrTestOnly] = useState(false);
  const abortControllerRef = useRef<AbortController>();

  useEffect(() => {
    storageService.getAppSettings().then((settings) => {
      setPdfOcrLanguage(settings.pdfOcrLanguage ?? "jpn+eng");
    }).catch(() => undefined);
  }, []);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (
      pdfOcrMode === "highAccuracy" &&
      !pdfOcrTestOnly &&
      !window.confirm("高精度OCRは時間がかかり、iPhoneのメモリやバッテリーを多く使います。まず先頭3ページだけのテストOCRを推奨します。このまま実行しますか？")
    ) {
      event.target.value = "";
      return;
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsImporting(true);
    setResults([]);
    try {
      const importResults = await importService.importFiles(files, setProgress, {
        signal: abortController.signal,
        pdfOcrMode,
        pdfOcrLanguage,
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
          <label>
            PDF OCRモード
            <select
              value={pdfOcrMode}
              disabled={isImporting}
              onChange={(event) => setPdfOcrMode(event.target.value as typeof pdfOcrMode)}
            >
              <option value="off">PDF文字層のみ（高速）</option>
              <option value="auto">低品質ページだけOCR</option>
              <option value="force">全ページOCR</option>
              <option value="highAccuracy">高精度OCR（時間がかかります）</option>
            </select>
          </label>
          <label>
            OCR言語
            <select
              value={pdfOcrLanguage}
              disabled={isImporting || pdfOcrMode === "off"}
              onChange={(event) => setPdfOcrLanguage(event.target.value as typeof pdfOcrLanguage)}
            >
              <option value="jpn+eng">日本語 + 英語</option>
              <option value="jpn">日本語のみ</option>
            </select>
          </label>
          <label className="check-option">
            <input
              type="checkbox"
              checked={pdfOcrTestOnly}
              disabled={isImporting || pdfOcrMode === "off"}
              onChange={(event) => setPdfOcrTestOnly(event.target.checked)}
            />
            <span>テストOCRとして先頭3ページだけ登録する</span>
          </label>
          {pdfOcrMode !== "off" ? (
            <p className="helper-text">
              OCRは時間がかかります。特に高精度OCRや長大PDFでは、まず先頭3ページだけで精度を確認してください。OCR用データは必要時だけ読み込みます。
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
