"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const TOUR_KEY = "finos_tour_v1";
export const TOUR_EVENT = "finos:tour";

type Step = { title: string; body: string; points?: string[]; href?: string; cta?: string; hl?: string };

const STEPS: Step[] = [
  {
    title: "Welcome to FinOS",
    body: "FinOS turns your bank statement into a forecast: where your balance is heading, which bills are coming, and whether you might run short. This tour takes about a minute.",
  },
  {
    title: "Start with a statement",
    body: "Everything begins with a CSV from your bank. Download one from your bank's website or app, then upload it here.",
    points: ["It needs a date, a description and amounts", "Duplicates are skipped, so re-importing is safe", "Three or more months gives noticeably better forecasts"],
    href: "/import", cta: "Open Import", hl: "/import",
  },
  {
    title: "Overview is your dashboard",
    body: "One screen for where you stand today and where you are heading.",
    points: ["Safe to spend: money you can use now and still stay above zero in 9 of 10 simulated futures", "The chart shows your actual balance, then the forecast with a shaded likely range", "Switch between 30, 60 and 90 days ahead"],
    href: "/", cta: "Open Overview", hl: "/",
  },
  {
    title: "Ask the assistant before you decide",
    body: "Thinking of a big purchase or a loan? Ask in plain words, like “Can I afford a ₹60,000 laptop?”",
    points: ["It reads your real numbers, never guesses them", "It runs a simulation and answers with a verdict and a chart", "Follow-up questions are suggested after each answer"],
    href: "/assistant", cta: "Open Assistant", hl: "/assistant",
  },
  {
    title: "See where your money went",
    body: "Spending groups every rupee by category and by shop or app.",
    points: ["Pick this month, 3 months or all time", "Select any tile for its history, monthly trend and every payment"],
    href: "/spending", cta: "Open Spending", hl: "/spending",
  },
  {
    title: "Spot patterns and plan ahead",
    body: "Insights shows how this month compares with last, plus income against spending. Bills lists repeating payments found automatically, with dates and yearly cost.",
    href: "/bills", cta: "Open Bills", hl: "/bills",
  },
  {
    title: "Keep categories accurate",
    body: "Transactions lists everything and lets you fix a category in one click. Your budgets and forecast learn from every fix.",
    points: ["You can replay this tour any time from Guide in the top bar"],
    href: "/transactions", cta: "Open Transactions", hl: "/transactions",
  },
];

export function markTourDone() {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* storage unavailable */ }
}
export function tourSeen() {
  try { return localStorage.getItem(TOUR_KEY) === "1"; } catch { return true; }
}

export function Tour({ open, onClose, onStep }: { open: boolean; onClose: () => void; onStep: (hl: string | null) => void }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => { onStep(open ? step.hl ?? null : null); }, [open, step, onStep]);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement;
    box.current?.focus();
    return () => prevFocus.current?.focus?.();
  }, [open]);

  function close() { markTourDone(); onClose(); }
  function go(href: string) { markTourDone(); onClose(); router.push(href); }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowRight" && !last) setI(i + 1);
    if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
    if (e.key !== "Tab" || !box.current) return;
    const f = box.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!f.length) return;
    const first = f[0], end = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  }

  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} className="tour float" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} onKeyDown={onKey}>
        <div className="between">
          <span className="tag">Step {i + 1} of {STEPS.length}</span>
          <button className="linkbtn small muted" onClick={close}>Skip tour</button>
        </div>
        <div className="progress" aria-hidden="true">{STEPS.map((_, n) => <i key={n} className={n <= i ? "on" : ""} />)}</div>
        <h2 className="h-sm" id="tour-title" style={{ marginTop: 20 }}>{step.title}</h2>
        <p style={{ marginTop: 10, fontSize: 16.5, lineHeight: 1.55 }}>{step.body}</p>
        {step.points && <ul className="md-list" style={{ marginTop: 12 }}>{step.points.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="row" style={{ marginTop: 24, justifyContent: "space-between" }}>
          <button className="btn ghost sm" onClick={() => setI(i - 1)} disabled={i === 0}>Back</button>
          <div className="row">
            {step.href && step.cta && <button className="btn ghost sm" onClick={() => go(step.href!)}>{step.cta}</button>}
            {last ? <button className="btn sm" onClick={close}>Finish</button> : <button className="btn sm" onClick={() => setI(i + 1)}>Next</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
