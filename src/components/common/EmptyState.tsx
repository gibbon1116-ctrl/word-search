import { FileText } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty-state">
      <FileText size={34} aria-hidden="true" />
      <p className="empty-title">{title}</p>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
