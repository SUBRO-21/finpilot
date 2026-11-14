export const CATEGORIES = [
  "Income", "Rent", "Groceries", "Dining", "Transport", "Utilities", "Subscriptions",
  "Loan/EMI", "Shopping", "Health", "Entertainment", "Travel", "Education", "Transfers",
  "Fees", "Refund", "Other",
] as const;

const RULES: [string, RegExp][] = [
  ["Income", /salary|payroll|stipend|invoice paid|client payment|freelance|dividend|interest credit/i],
  ["Loan/EMI", /\bemi\b|loan|mortgage|installment|instalment/i],
  ["Rent", /\brent\b|landlord|lease/i],
  ["Subscriptions", /netflix|spotify|prime|hotstar|youtube|icloud|google one|adobe|notion|chatgpt|openai|subscription|membership/i],
  ["Utilities", /electric|water bill|gas bill|broadband|internet|wifi|jio|airtel|vodafone|recharge|utility/i],
  ["Groceries", /grocer|supermarket|bigbasket|blinkit|zepto|dmart|walmart|kroger|market|instamart/i],
  ["Dining", /restaurant|cafe|coffee|starbucks|zomato|swiggy|mcdonald|domino|pizza|food|dine/i],
  ["Transport", /uber|ola\b|lyft|fuel|petrol|diesel|metro|bus |taxi|parking|toll/i],
  ["Health", /pharma|hospital|clinic|doctor|medic|apollo|lab test|gym/i],
  ["Travel", /airline|flight|indigo|hotel|airbnb|booking|irctc|makemytrip|train/i],
  ["Education", /tuition|course|udemy|coursera|school|college|exam/i],
  ["Entertainment", /cinema|movie|pvr|bookmyshow|steam|playstation|concert/i],
  ["Shopping", /amazon|flipkart|myntra|ebay|store|mall|retail|ikea|nike|zara/i],
  ["Fees", /\bfee\b|charges|penalty|gst on|annual fee|service charge/i],
  ["Refund", /refund|reversal|cashback/i],
  ["Transfers", /transfer|neft|imps|rtgs|upi to|sent to|self/i],
];

export function categorizeRule(description: string, amount: number): string | null {
  for (const [cat, re] of RULES) {
    if (re.test(description)) {
      if (cat === "Income" && amount < 0) continue;
      return cat;
    }
  }
  if (amount > 0) return "Income";
  return null;
}
