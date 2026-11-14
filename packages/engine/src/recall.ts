export type RecallStatus = "REQUESTED" | "UNDER_REVIEW" | "REFUNDED" | "REJECTED" | "WITHDRAWN";

export const ACTIVE_RECALL: RecallStatus[] = ["REQUESTED", "UNDER_REVIEW"];

/** User-driven state machine (there is no merchant-side portal; the user records the outcome). */
export const RECALL_TRANSITIONS: Record<RecallStatus, RecallStatus[]> = {
  REQUESTED: ["UNDER_REVIEW", "REFUNDED", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["REFUNDED", "REJECTED", "WITHDRAWN"],
  REFUNDED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export interface RecallEligibility {
  eligible: boolean;
  reason?: string;
  daysLeft?: number;
}

export function recallEligibility(
  t: { amount: number; isMerchant: boolean; isRefund: boolean; date: Date },
  hasActiveRecall: boolean,
  windowDays: number,
  now = new Date(),
): RecallEligibility {
  if (t.amount >= 0) return { eligible: false, reason: "Only outgoing payments can be recalled" };
  if (t.isRefund) return { eligible: false, reason: "Refund entries cannot be recalled" };
  if (!t.isMerchant) return { eligible: false, reason: "Recall is only available when the receiver is a merchant" };
  if (hasActiveRecall) return { eligible: false, reason: "A recall is already in progress for this transaction" };
  const age = Math.floor((now.getTime() - t.date.getTime()) / 86400000);
  if (age > windowDays) return { eligible: false, reason: `Recall window of ${windowDays} days has passed` };
  return { eligible: true, daysLeft: windowDays - age };
}
