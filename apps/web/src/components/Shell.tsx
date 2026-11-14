"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getToken, setToken } from "@/lib/api";
import { Tour, TOUR_EVENT, tourSeen } from "./Tour";

const links = [
  ["/", "Overview"],
  ["/assistant", "Assistant"],
  ["/spending", "Spending"],
  ["/insights", "Insights"],
  ["/bills", "Bills"],
  ["/transactions", "Transactions"],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tour, setTour] = useState(false);
  const [hl, setHl] = useState<string | null>(null);
  const isAuth = path === "/login";
  const onStep = useCallback((h: string | null) => setHl(h), []);

  useEffect(() => {
    if (!isAuth && !getToken()) router.replace("/login");
    else setReady(true);
  }, [isAuth, router, path]);

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
            <Link href="/guide" className={hl === "/guide" ? "hl" : undefined} aria-current={path === "/guide" ? "page" : undefined}>Guide</Link>
            <button className="linkbtn" onClick={() => { setToken(null); router.push("/login"); }}>Sign out</button>
            <Link href="/import" className={`btn sm ${hl === "/import" ? "hl-btn" : ""}`}>Import CSV</Link>
          </div>
        </div>
      </header>
      <main className="page">{ready ? children : null}</main>
      <Tour open={tour} onClose={() => setTour(false)} onStep={onStep} />
    </>
  );
}
