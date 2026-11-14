/**
 * "What is this payment for?" choices asked about every recurring payment.
 * Each label maps to a category, so the answer recategorizes past and future transactions.
 * Payments to a person's own bank account (a landlord, a maid, a tenant paying you) arrive as
 * bare names, so only the user can say what they are.
 */
import { CATEGORIES } from "./categorize";

export interface PayType { label: string; category: string }

export const PAY_TYPES_OUT: PayType[] = [
  { label: "Rent", category: "Rent" },
  { label: "Loan or EMI", category: "Loan/EMI" },
  { label: "Subscription", category: "Subscriptions" },
  { label: "Bill or utility", category: "Utilities" },
  { label: "Insurance premium", category: "Insurance" },
  { label: "School or tuition fees", category: "Education" },
  { label: "Household help", category: "Household" },
  { label: "Investment or SIP", category: "Investments" },
  { label: "Family support", category: "People" },
  { label: "My own other account", category: "Transfers" },
  { label: "Something else", category: "Other" },
];

export const PAY_TYPES_IN: PayType[] = [
  { label: "Salary", category: "Income" },
  { label: "Rent from a tenant", category: "Income" },
  { label: "Client or business payment", category: "Income" },
  { label: "Interest or dividends", category: "Income" },
  { label: "Family support", category: "People" },
  { label: "Money paid back to me", category: "People" },
  { label: "My own other account", category: "Transfers" },
  { label: "Something else", category: "Other" },
];

export const payTypesFor = (amount: number) => (amount < 0 ? PAY_TYPES_OUT : PAY_TYPES_IN);

/** Categories that say nothing about what a payment is for: the user must pick a type. */
const VAGUE = new Set(["Transfers", "People", "Other"]);

/** Best guess of the type from the current category, or null when we cannot tell and must ask. */
export function guessPayType(category: string, amount: number, description = ""): string | null {
  if (amount > 0) {
    if (/salary|payroll|stipend|pension/i.test(description)) return "Salary";
    if (/\brent\b|tenant/i.test(description)) return "Rent from a tenant";
    if (/interest|dividend/i.test(description)) return "Interest or dividends";
    if (category === "Income" || VAGUE.has(category)) return null; // salary vs client vs family: ask
  }
  if (VAGUE.has(category)) return null;
  // A clear category with no matching type (fuel is Transport, medicines are Health): keep it as the answer
  return payTypesFor(amount).find((t) => t.category === category)?.label ?? category;
}

/** Category for a chosen type. A plain category name (offered when the guess was the category itself) maps to itself. */
export function payTypeCategory(label: string, amount: number): string | null {
  const t = payTypesFor(amount).find((x) => x.label === label);
  if (t) return t.category;
  return (CATEGORIES as readonly string[]).includes(label) && !VAGUE.has(label) ? label : null;
}
