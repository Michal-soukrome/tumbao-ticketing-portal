import { Link, Outlet } from "@tanstack/react-router";
import { ScanLine, Ticket } from "lucide-react";
import { TestModeBanner } from "../components/test-mode-banner";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const navLinkClass =
  "flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900";
const navLinkActiveClass = "text-rose-600 hover:text-rose-600";

export function RootLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <TestModeBanner />
      <header className="relative border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-bold text-slate-900"
          >
            <span>Galavečer Tumbao 2027</span>
          </Link>

          {/* Desktop navigation */}
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-6 lg:flex"
          >
            <Link
              to="/"
              className={navLinkClass}
              activeProps={{
                className: `${navLinkClass} ${navLinkActiveClass}`,
              }}
            >
              Vstupenky
            </Link>

            <Link
              to="/admin"
              className={navLinkClass}
              activeProps={{
                className: `${navLinkClass} ${navLinkActiveClass}`,
              }}
            >
              Administrace
            </Link>

            <Link
              to="/admin/scan"
              className={`${navLinkClass} flex items-center gap-1.5`}
              activeProps={{
                className: `${navLinkClass} ${navLinkActiveClass} flex items-center gap-1.5`,
              }}
            >
              <ScanLine size={17} />
              Ověření vstupu
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={menuOpen ? "Zavřít menu" : "Otevřít menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 lg:hidden"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="border-t border-slate-200 px-6 py-3 lg:hidden"
          >
            <div className="flex flex-col gap-4">
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className={navLinkClass}
                activeProps={{
                  className: `${navLinkClass} ${navLinkActiveClass}`,
                }}
              >
                Vstupenky
              </Link>

              <Link
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className={navLinkClass}
                activeProps={{
                  className: `${navLinkClass} ${navLinkActiveClass}`,
                }}
              >
                Administrace
              </Link>

              <Link
                to="/admin/scan"
                onClick={() => setMenuOpen(false)}
                className={`${navLinkClass} flex items-center gap-1.5`}
                activeProps={{
                  className: `${navLinkClass} ${navLinkActiveClass} flex items-center gap-1.5`,
                }}
              >
                <ScanLine size={17} />
                Ověření vstupu
              </Link>
            </div>
          </nav>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
