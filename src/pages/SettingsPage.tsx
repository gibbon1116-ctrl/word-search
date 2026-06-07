import { useEffect, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { PrivacyNotes } from "../components/settings/PrivacyNotes";
import { JA } from "../i18n/ja";
import type { AppSettings } from "../models/AppSettings";
import { capacityService } from "../services/storage/CapacityService";
import { storageService } from "../services/storage/StorageService";
import { formatBytes } from "../utils/fileUtils";

export function SettingsPage() {
  const [summary, setSummary] = useState({ documentCount: 0, chunkCount: 0, indexCount: 0 });
  const [capacity, setCapacity] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [settings, setSettings] = useState<AppSettings>();
  const [message, setMessage] = useState("");

  async function refresh() {
    const [nextSummary, nextCapacity, nextSettings] = await Promise.all([
      storageService.getStorageSummary(),
      capacityService.estimate(),
      storageService.getAppSettings(),
    ]);
    setSummary(nextSummary);
    setCapacity(nextCapacity);
    setSettings(nextSettings);
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  async function handleDeleteAll() {
    if (!window.confirm(JA.confirm.deleteAllDocuments)) return;
    await storageService.deleteAllDocuments();
    setMessage(JA.messages.allDocumentsDeleted);
    await refresh();
  }

  async function handleRebuildIndex() {
    if (!window.confirm(JA.confirm.rebuildIndex)) return;
    await storageService.rebuildSearchIndex();
    if (settings) {
      await storageService.saveAppSettings({ ...settings, lastIndexRebuiltAt: new Date().toISOString() });
    }
    setMessage(JA.messages.indexRebuilt);
    await refresh();
  }

  async function handleClearHistory() {
    if (!window.confirm(JA.confirm.clearHistory)) return;
    await storageService.clearSearchHistory();
    setMessage(JA.messages.searchHistoryCleared);
  }

  async function saveSnippetSettings() {
    if (!settings) return;
    await storageService.saveAppSettings(settings);
    setMessage(JA.messages.saveSnippetSettings);
    await refresh();
  }

  return (
    <div className="page-stack">
      <PageHeader title={JA.screens.settings} description={JA.descriptions.settings} />

      {message ? <div className="status-banner success">{message}</div> : null}

      <section className="detail-panel">
        <div className="meta-row">
          <span>{JA.labels.documentCount}</span>
          <strong>{summary.documentCount}</strong>
        </div>
        <div className="meta-row">
          <span>{JA.labels.chunkCount}</span>
          <strong>{summary.chunkCount}</strong>
        </div>
        <div className="meta-row">
          <span>{JA.labels.searchIndexCount}</span>
          <strong>{summary.indexCount}</strong>
        </div>
        <div className="meta-row">
          <span>{JA.labels.storageSize}</span>
          <strong>{capacity.usage ? formatBytes(capacity.usage) : "取得できません"}</strong>
        </div>
        <div className="meta-row">
          <span>{JA.labels.storageQuota}</span>
          <strong>{capacity.quota ? formatBytes(capacity.quota) : "取得できません"}</strong>
        </div>
      </section>

      {settings ? (
        <section className="info-section">
          <h2>{JA.labels.snippetSettings}</h2>
          <p>{JA.descriptions.snippetSettings}</p>
          <div className="number-grid">
            <label>
              {JA.labels.beforeSnippetChars}
              <input
                type="number"
                min={20}
                max={300}
                value={settings.snippetBeforeChars}
                onChange={(event) => setSettings({ ...settings, snippetBeforeChars: Number(event.target.value) })}
              />
            </label>
            <label>
              {JA.labels.afterSnippetChars}
              <input
                type="number"
                min={20}
                max={300}
                value={settings.snippetAfterChars}
                onChange={(event) => setSettings({ ...settings, snippetAfterChars: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            OCR言語
            <select
              value={settings.pdfOcrLanguage ?? "jpn+eng"}
              onChange={(event) => setSettings({ ...settings, pdfOcrLanguage: event.target.value as "jpn" | "jpn+eng" })}
            >
              <option value="jpn+eng">日本語 + 英語</option>
              <option value="jpn">日本語のみ</option>
            </select>
          </label>
          <PrimaryButton type="button" variant="secondary" onClick={saveSnippetSettings}>
            {JA.labels.saveSettings}
          </PrimaryButton>
        </section>
      ) : null}

      <section className="settings-actions">
        <PrimaryButton type="button" variant="secondary" onClick={handleRebuildIndex}>
          {JA.actions.rebuildIndex}
        </PrimaryButton>
        <PrimaryButton type="button" variant="secondary" onClick={handleClearHistory}>
          {JA.actions.clearHistory}
        </PrimaryButton>
        <PrimaryButton type="button" variant="danger" onClick={handleDeleteAll}>
          {JA.actions.deleteAll}
        </PrimaryButton>
      </section>

      <PrivacyNotes />

      <section className="info-section">
        <h2>{JA.labels.appInfo}</h2>
        <p>{JA.descriptions.appInfo}</p>
        <p>{JA.descriptions.googleDriveViaFiles}</p>
      </section>
    </div>
  );
}
