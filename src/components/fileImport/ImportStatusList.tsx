import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { ImportProgress, ImportResult } from "../../services/import/ImportService";

export function ImportStatusList({
  progress,
  results,
}: {
  progress?: ImportProgress;
  results: ImportResult[];
}) {
  return (
    <div className="status-list">
      {progress ? (
        <div className="status-banner">
          <Loader2 className="spin" size={18} aria-hidden="true" />
          <span>
            {progress.current} / {progress.total} 件目: {progress.fileName} - {progress.message}
          </span>
        </div>
      ) : null}
      {results.map((result) => (
        <div className={`status-row ${result.status}`} key={`${result.fileName}-${result.status}`}>
          {result.status === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{result.fileName}</strong>
            <p>{result.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
