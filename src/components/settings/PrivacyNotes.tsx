import { ShieldCheck } from "lucide-react";
import { JA } from "../../i18n/ja";

export function PrivacyNotes() {
  return (
    <section className="info-section">
      <h2>
        <ShieldCheck size={20} aria-hidden="true" />
        データ保存に関する注意事項
      </h2>
      <ul className="check-list">
        {JA.privacyNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
