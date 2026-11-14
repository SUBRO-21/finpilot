import { interpret } from "./bank";
import type { ParsedRow } from "./types";

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function normDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[ /-]([A-Za-z]{3})[a-z]*[ ,/-]*(\d{4})/); // 01-Nov-2026
  if (m) {
    const mi = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[2].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function num(s: string | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  let t = s.trim();
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  t = t.replace(/[^0-9.]/g, "");
  if (!t) return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}


const NOISE = /Federal Bank|Ph:|Website:|Page \d+ of|DISCLAIMER|computer generated|previous working day|fullparticulars|Abbreviations|END OF STATEMENT|Interest on SB|Mobile Banking|Fund Transfer|Cash Transaction|Clearing Transaction|Transfer Transaction|responsible/i;
const DATE_CELL = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/;

/**
 * Header-less bank exports (e.g. Federal Bank): ten fixed columns
 * date, value date, particulars, type, transaction id, cheque no, withdrawal, deposit, balance, Cr/Dr.
 * Particulars wrap onto following lines, and page headers and footers are mixed in, so those are merged and skipped.
 * The opening balance is worked out from the first transaction's running balance.
 */
function parseHeaderless(grid: string[][]): { rows: ParsedRow[]; errors: string[]; openingBalance: number | null } {
  type Raw = { date: string; desc: string; ref: string; amount: number; balance: number | null };
  const raws: Raw[] = [];
  const errors: string[] = [];
  let cur: Raw | null = null;
  for (const row of grid) {
    const r = [...row, "", "", "", "", "", "", "", "", "", ""].slice(0, 10).map((c) => c.trim());
    if (DATE_CELL.test(r[0])) {
      const date = normDate(r[0]);
      const wd = num(r[6]), dep = num(r[7]);
      const amount = (dep ?? 0) - Math.abs(wd ?? 0);
      if (!date || amount === 0) { errors.push(`Row for ${r[0]} skipped`); cur = null; continue; }
      const bal = num(r[8]);
      cur = { date, desc: r[2], ref: r[4], amount, balance: bal == null ? null : /^dr$/i.test(r[9]) ? -Math.abs(bal) : bal };
      raws.push(cur);
    } else if (cur && !r[0] && r[2] && !NOISE.test(row.join(" "))) {
      cur.desc += r[2]; // wrapped particulars continue the previous transaction
    }
  }
  const ascending = raws.length < 2 || raws[0].date <= raws[raws.length - 1].date;
  const first = ascending ? raws[0] : raws[raws.length - 1];
  const openingBalance = first && first.balance != null ? Math.round((first.balance - first.amount) * 100) / 100 : null;
  const rows: ParsedRow[] = raws.map((t) => {
    const i = interpret(t.desc, t.amount);
    return { date: t.date, description: i.label, amount: t.amount, raw: t.desc, ref: t.ref || undefined, category: i.category };
  });
  return { rows, errors, openingBalance };
}

/**
 * Accepts bank-statement style CSVs. Needs a date column, a description-ish column,
 * and either `amount` (negative = outflow) or `debit`/`credit` columns.
 */
export function parseStatement(text: string): { rows: ParsedRow[]; errors: string[]; openingBalance: number | null } {
  const grid = parseCsvRows(text);
  const errors: string[] = [];
  const firstRow = grid.find((r) => r.some((c) => c.trim() !== ""));
  if (firstRow && DATE_CELL.test(firstRow[0].trim()) && firstRow.length >= 9) return parseHeaderless(grid);
  if (grid.length < 2) return { rows: [], errors: ["CSV needs a header row and at least one data row"], openingBalance: null };
  const head = grid[0].map((h) => h.trim().toLowerCase());
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iDate = find(/date/);
  const iDesc = find(/desc|narration|detail|payee|merchant|particular|name/);
  const iAmt = head.findIndex((h) => h === "amount" || h === "amt");
  const iDeb = find(/debit|withdraw/);
  const iCred = find(/credit|deposit/);
  const iBal = head.findIndex((h) => h === "balance" || h === "closing balance");
  const iRef = find(/reference|ref no|tran.?id|utr|txn id/);
  let openingBalance: number | null = null;
  if (iDate < 0 || iDesc < 0 || (iAmt < 0 && iDeb < 0 && iCred < 0))
    return { rows: [], errors: ["Could not find date, description and amount (or debit/credit) columns"], openingBalance: null };

  const rows: ParsedRow[] = [];
  grid.slice(1).forEach((r, idx) => {
    const date = normDate(r[iDate] ?? "");
    const description = (r[iDesc] ?? "").trim();
    if (/^opening balance/i.test(description)) {
      openingBalance = num(r[iBal]) ?? num(r[iAmt]) ?? null;
      return;
    }
    let amount: number | null;
    if (iAmt >= 0) amount = num(r[iAmt]);
    else {
      const d = num(r[iDeb]) ?? 0;
      const c = num(r[iCred]) ?? 0;
      amount = c - Math.abs(d);
      if (d === 0 && c === 0) amount = null;
    }
    if (!date || !description || amount == null || amount === 0) {
      errors.push(`Row ${idx + 2} skipped`);
      return;
    }
    rows.push({ date, description, amount, ref: iRef >= 0 ? (r[iRef] ?? "").trim() || undefined : undefined });
  });
  return { rows, errors, openingBalance };
}
