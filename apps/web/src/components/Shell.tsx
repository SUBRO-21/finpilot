"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, dayYear, getToken, setToken } from "@/lib/api";
import { Tour, TOUR_EVENT, tourSeen } from "./Tour";

export const DATA_EVENT = "finos:data";

const links = [
  ["/", "Overview"],
  ["/assistant", "Assistant"],
  ["/spending", "Spending"],
  ["/insights", "Insights"],
  ["/bills", "Bills"],
  ["/goals", "Goals"],
  ["/portfolio", "Portfolio"],
  ["/transactions", "Transactions"],
] as const;

type Status = { hasData: boolean; ageDays: number | null; level: "none" | "fresh" | "aging" | "stale"; lastDate: string | null; pending: number };

export const ageText = (d: number) => (d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`);

/** How old the newest transaction is. State shows in words and shape as well as tone. */
function Freshness({ s }: { s: Status }) {
  if (!s.hasData || s.ageDays == null) return null;
  const note = s.level === "fresh" ? "Up to date" : s.level === "aging" ? "Update due soon" : "Out of date, upload a new statement";
  return (
    <Link href="/import" className={`fresh ${s.level}`} title={`Last transaction ${dayYear(s.lastDate!)}, ${ageText(s.ageDays)}. ${note}.`} aria-label={`Last transaction ${ageText(s.ageDays)}. ${note}.`}>
      <span className="cap">Last transaction</span>
      <span className="val">{ageText(s.ageDays)}</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tour, setTour] = useState(false);
  const [hl, setHl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAuth = path === "/login";
  const onStep = useCallback((h: string | null) => setHl(h), []);

  useEffect(() => {
    if (!isAuth && !getToken()) router.replace("/login");
    else setReady(true);
  }, [isAuth, router, path]);

  const refresh = useCallback(() => { api("/plan/status").then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(() => { if (ready && !isAuth) refresh(); }, [ready, isAuth, path, refresh]);
  useEffect(() => {
    window.addEventListener(DATA_EVENT, refresh);
    return () => window.removeEventListener(DATA_EVENT, refresh);
  }, [refresh]);

  // First visit after sign-in opens the tour; Guide can replay it
  useEffect(() => {
    if (!ready || isAuth) return;
    if (!tourSeen()) setTour(true);
  }, [ready, isAuth]);
  useEffect(() => {
    const open = () => setTour(true);
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);

  // Account menu: close on outside click, Escape, or navigation
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); (menuRef.current?.querySelector("button") as HTMLElement | null)?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  if (isAuth) return <>{children}</>;
  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <header className="nav">
        <div className="nav-in">
          <Link href="/" className="logo">FinOS</Link>
          <nav className="links" aria-label="Main">
            {links.map(([href, label]) => (
              <Link key={href} href={href} aria-current={current(href) ? "page" : undefined} className={hl === href ? "hl" : undefined}>{label}</Link>
            ))}
          </nav>
          <div className="nav-r">
            {status && <Freshness s={status} />}
            <Link href="/import" className={`btn sm ${hl === "/import" ? "hl-btn" : ""}`}>Import CSV</Link>
            <div className="menu" ref={menuRef}>
              <button className="menu-btn" aria-expanded={menu} aria-controls="acct-menu" onClick={() => setMenu(!menu)}>
                <span>Menu</span>
                {status && status.pending > 0 && <span className="count" aria-label={`${status.pending} questions waiting`}>{status.pending}</span>}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={menu ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"} /></svg>
              </button>
              {menu && (
                <div className="menu-pop" id="acct-menu">
                  {status && status.pending > 0 && <Link href="/review" className="menu-item">Review questions <span className="count">{status.pending}</span></Link>}
                  <Link href="/guide" className="menu-item">Guide and tour</Link>
                  <Link href="/import" className="menu-item">Import a statement</Link>
                  <button className="menu-item" onClick={() => { setToken(null); router.push("/login"); }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="page">{ready ? children : null}</main>
      <Tour open={tour} onClose={() => setTour(false)} onStep={onStep} />
    </>
  );
}
