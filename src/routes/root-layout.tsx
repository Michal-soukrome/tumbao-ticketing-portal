import { Link, Outlet } from "@tanstack/react-router";
import { ScanLine, Ticket } from "lucide-react";
import { TestModeBanner } from "../components/test-mode-banner";

const navLinkClass =
  "flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900";
const navLinkActiveClass = "text-rose-600 hover:text-rose-600";

export function RootLayout() {
  return (
    <>
      <TestModeBanner />
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-bold text-slate-900"
        >
          <span>Galavečer Tumbao 2027</span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-6">
          <Link
            to="/"
            className={navLinkClass}
            activeProps={{ className: `${navLinkClass} ${navLinkActiveClass}` }}
          >
            Vstupenky
          </Link>
          <Link
            to="/admin"
            className={navLinkClass}
            activeProps={{ className: `${navLinkClass} ${navLinkActiveClass}` }}
          >
            Administrace
          </Link>
          <Link
            to="/admin/scan"
            className={navLinkClass}
            activeProps={{ className: `${navLinkClass} ${navLinkActiveClass}` }}
          >
            <ScanLine size={17} /> Ověření vstupu
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
