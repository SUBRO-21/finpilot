const PATHS: Record<string, string> = {
  Groceries: "M5 8h14l-1.5 11a2 2 0 0 1-2 1.7h-7a2 2 0 0 1-2-1.7L5 8zM9 8l3-5 3 5",
  Dining: "M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 2-3 5-3 8h6V3h-3zM17 11v10",
  Transport: "M5 16l1.5-6h11L19 16M3 16h18v3H3zM7 19v2M17 19v2",
  Utilities: "M13 2 4 14h7l-1 8 9-12h-7z",
  Subscriptions: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  "Loan/EMI": "M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7z",
  Rent: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  Shopping: "M6 7h12l1 14H5zM9 7a3 3 0 0 1 6 0",
  Health: "M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z",
  Entertainment: "M4 4h16v16H4zM10 8.5v7l6-3.5z",
  Travel: "M21 3 3 10l7 3 3 7z",
  Education: "M4 4h12a4 4 0 0 1 4 4v13H8a4 4 0 0 1-4-4zM4 17a4 4 0 0 1 4-4h12",
  Fees: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  Transfers: "M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4",
  Income: "M12 19V5M5 12l7-7 7 7",
  Refund: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  Other: "M5 12h.01M12 12h.01M19 12h.01",
};

export function CategoryIcon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.Other} />
    </svg>
  );
}

/** Shops and apps get a monogram instead of a stock icon. */
export function Monogram({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: "var(--fog)", color: "var(--steel)", display: "inline-grid", placeItems: "center", fontSize: size * 0.42, fontWeight: 700, flex: "none" }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
