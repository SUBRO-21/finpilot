/**
 * Turns raw bank "particulars" into something a person can read, plus a category hint.
 * Built for Indian bank statements where UPI payments carry the payee handle and, for merchants,
 * a four-digit merchant category code (MCC) at the end, e.g. `UPIOUT/114253492491/pincodeshopping@ybl/Paym/5411`.
 * MCC 0000 means a person-to-person payment.
 */
export interface Interpreted {
  label: string;
  category?: string;
}

const MCC: Record<string, [string, string]> = {
  "5411": ["Grocery store", "Groceries"], "5499": ["Food store", "Groceries"], "5451": ["Dairy", "Groceries"], "5422": ["Meat shop", "Groceries"], "5441": ["Sweet shop", "Dining"],
  "5462": ["Bakery", "Dining"], "5814": ["Fast food", "Dining"], "5812": ["Restaurant", "Dining"], "5811": ["Caterer", "Dining"], "5813": ["Bar", "Dining"],
  "5310": ["Discount store", "Shopping"], "5311": ["Department store", "Shopping"], "5651": ["Clothing store", "Shopping"], "5691": ["Clothing store", "Shopping"], "5699": ["Apparel", "Shopping"],
  "5732": ["Electronics store", "Shopping"], "5734": ["Software store", "Shopping"], "5399": ["General store", "Shopping"], "5999": ["Retail store", "Shopping"], "5993": ["Tobacco shop", "Shopping"],
  "5262": ["Online marketplace", "Shopping"], "5045": ["Computer store", "Shopping"], "5651 ": ["Clothing store", "Shopping"], "5944": ["Jewellery", "Shopping"], "5995": ["Pet shop", "Shopping"],
  "5942": ["Book store", "Education"], "5943": ["Stationery store", "Education"], "5111": ["Stationery", "Education"], "8220": ["College", "Education"], "8299": ["Education", "Education"], "8211": ["School", "Education"],
  "4111": ["Local transit", "Transport"], "4112": ["Railway", "Transport"], "4121": ["Taxi", "Transport"], "4131": ["Bus", "Transport"], "4789": ["Transport", "Transport"], "5541": ["Fuel station", "Transport"], "5542": ["Fuel station", "Transport"], "7523": ["Parking", "Transport"],
  "4899": ["Cable and streaming", "Subscriptions"], "5968": ["Subscription", "Subscriptions"], "5817": ["Digital goods", "Subscriptions"], "5815": ["Digital media", "Subscriptions"], "5816": ["Digital games", "Entertainment"],
  "4814": ["Telecom", "Utilities"], "4900": ["Utilities", "Utilities"], "4816": ["Internet", "Utilities"],
  "5912": ["Pharmacy", "Health"], "5047": ["Medical supplies", "Health"], "8011": ["Doctor", "Health"], "8062": ["Hospital", "Health"], "8099": ["Health service", "Health"], "7230": ["Salon", "Health"], "7298": ["Spa", "Health"], "8021": ["Dentist", "Health"],
  "7832": ["Cinema", "Entertainment"], "7841": ["Video rental", "Entertainment"], "7994": ["Gaming", "Entertainment"], "7999": ["Recreation", "Entertainment"],
  "7011": ["Hotel", "Travel"], "4511": ["Airline", "Travel"], "4722": ["Travel agency", "Travel"],
  "6211": ["Stock broker", "Investments"], "6012": ["Financial institution", "Other"], "6540": ["Wallet top-up", "Transfers"], "4829": ["Money transfer", "Transfers"],
};

/** [pattern, display name, category] checked against the payee handle and particulars */
const BRANDS: [RegExp, string, string][] = [
  [/crib|credclub|\bcred\b/i, "CRED card bill", "Credit card"],
  [/zerodha|groww|upstox|angelone|kite\b/i, "Zerodha", "Investments"],
  [/irctc/i, "IRCTC", "Travel"],
  [/swiggy/i, "Swiggy", "Dining"], [/zomato/i, "Zomato", "Dining"],
  [/uber/i, "Uber", "Transport"], [/rapido/i, "Rapido", "Transport"], [/redbus/i, "RedBus", "Transport"], [/\bola\b|olacabs/i, "Ola", "Transport"],
  [/blinkit/i, "Blinkit", "Groceries"], [/zepto/i, "Zepto", "Groceries"], [/bigbasket/i, "BigBasket", "Groceries"], [/dmart/i, "DMart", "Groceries"], [/instamart/i, "Instamart", "Groceries"],
  [/amazon/i, "Amazon", "Shopping"], [/flipkart/i, "Flipkart", "Shopping"], [/myntra/i, "Myntra", "Shopping"], [/meesho/i, "Meesho", "Shopping"], [/ajio/i, "Ajio", "Shopping"],
  [/netflix/i, "Netflix", "Subscriptions"], [/spotify/i, "Spotify", "Subscriptions"], [/hotstar/i, "Hotstar", "Subscriptions"], [/youtube/i, "YouTube", "Subscriptions"], [/primevideo/i, "Prime Video", "Subscriptions"],
  [/airtel/i, "Airtel", "Utilities"], [/jio/i, "Jio", "Utilities"], [/vodafone|\bvi\b/i, "Vi", "Utilities"], [/bsnl/i, "BSNL", "Utilities"],
  [/educational|college|school|universit|tuition|exam\b|byju/i, "", "Education"],
];

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s.])(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()).trim();

/** A readable payee from a UPI handle, or null for machine-generated QR / phone handles. */
function nameFromHandle(local: string): string | null {
  if (/^(q\d+|paytmqr\w*|bharatpe\w*|gpay-?\d+|phonepe\w*\d+|\d+(-\d+)?)$/i.test(local)) return null;
  if ((local.match(/\d/g) ?? []).length >= 7) return null;
  const base = local.split(/[._]/)[0].replace(/-?\d+$/, "");
  return base.length >= 4 && /[a-z]/i.test(base) ? titleCase(base) : null;
}

const phoneLast4 = (local: string) => {
  const d = local.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(0, 10).slice(-4) : null;
};

export function interpret(raw: string, amount: number): Interpreted {
  const text = raw.replace(/\s+/g, " ").trim();

  const upi = text.match(/^UPI\s?(OUT|IN)\/\d+\/?(.*)$/i);
  if (upi) {
    const inbound = upi[1].toUpperCase() === "IN";
    const rest = upi[2];
    const mcc = rest.match(/\/(\d{4})$/)?.[1];
    const vpa = rest.match(/([A-Za-z0-9._-]+)@([A-Za-z0-9]+)/);
    const local = vpa ? vpa[1].replace(/^gpay-/i, "") : "";

    for (const [re, name, cat] of BRANDS) {
      if (re.test(local) || re.test(rest)) {
        if (cat === "Education" && !name) break;
        return { label: name || "Payment", category: cat };
      }
    }
    if (!mcc || mcc === "0000") {
      const nm = nameFromHandle(local);
      const last4 = phoneLast4(local);
      return { label: nm ?? (last4 ? `Person ending ${last4}` : inbound ? "UPI received" : "UPI payment"), category: "People" };
    }
    const [mccLabel, mccCat] = MCC[mcc] ?? ["Local merchant", "Other"];
    const nm = nameFromHandle(local);
    const edu = /educational|college|school|universit|tuition/i.test(local);
    return { label: nm ?? mccLabel, category: edu ? "Education" : mccCat };
  }

  if (/^(FT )?IMPS\//i.test(text) || /^NFT\//i.test(text)) {
    const parts = text.split("/");
    const name = (/^NFT\//i.test(text) ? parts[1] : parts[parts.length - 1]) ?? "";
    const clean = titleCase(name.replace(/\s+[A-Z]$/, "").replace(/ LIMITED| LTD/i, "").trim());
    for (const [re, brand, cat] of BRANDS) if (re.test(name)) return { label: brand || clean, category: cat };
    if (/APIBanking|RZPX|payout/i.test(text)) return { label: "Razorpay payout", category: "Transfers" };
    if (/CASHFREE/i.test(text)) return { label: "Cashfree", category: amount > 0 ? "Refund" : "Credit card" };
    return { label: clean || "Bank transfer", category: amount > 0 ? "Income" : "Transfers" };
  }
  if (/^LT\/UPILN|UPIUMN/i.test(text)) return { label: "Loan EMI (UPI autopay)", category: "Loan/EMI" };
  if (/^TO ATM/i.test(text)) return { label: "ATM cash withdrawal", category: "Cash" };
  if (/^TO ECM/i.test(text)) return { label: titleCase((text.split("/").pop() ?? "").replace(/\\.*$/, "").trim()) || "Online payment", category: "Shopping" };
  if (/^SBINT/i.test(text)) return { label: "Savings interest", category: "Income" };
  if (/^ACHCR/i.test(text)) {
    const n = text.split("/")[1] ?? "";
    return { label: /div/i.test(n) ? `Dividend (${n.replace(/int|div|\d+|rd|th|st|nd/gi, "").trim() || "shares"})` : `${titleCase(n)} (dividend)`, category: "Income" };
  }
  if (/^NACH\//i.test(text)) return { label: titleCase(text.split("/")[1] ?? "Auto-debit"), category: /maintenance/i.test(text) ? "Rent" : "Other" };
  if (/^CHRG\/MOB ALERT/i.test(text)) return { label: "SMS alert charge", category: "Fees" };
  if (/^CHRG\//i.test(text)) return { label: titleCase((text.split("/")[1] ?? "Bank charge").trim()), category: "Fees" };
  if (/^COMP:/i.test(text)) return { label: "Bank adjustment", category: "Fees" };
  if (/REFUND/i.test(text)) return { label: "UPI refund", category: "Refund" };
  return { label: titleCase(text.split("/")[0] || text).slice(0, 60) };
}
