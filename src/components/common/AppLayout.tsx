import { FileSearch, Files, Home, Search, Settings, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { JA } from "../../i18n/ja";

const navItems = [
  { to: "/", label: JA.navigation.home, icon: Home },
  { to: "/import", label: JA.navigation.import, icon: UploadCloud },
  { to: "/documents", label: JA.navigation.documents, icon: Files },
  { to: "/search", label: JA.navigation.search, icon: Search },
  { to: "/settings", label: JA.navigation.settings, icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <FileSearch size={22} />
        </div>
        <div>
          <p className="app-title">{JA.appName}</p>
          <p className="app-subtitle">{JA.descriptions.appSubtitle}</p>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav" aria-label="主要メニュー">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon size={21} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
