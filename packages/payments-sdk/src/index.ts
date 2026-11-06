/** Provider-neutral payment interfaces. No payment provider is configured. */
export type PaymentProvider = "stripe" | "adyen" | "mollie";

export {
  assertBalancedJournalEntry,
  JournalEntryValidationError,
} from "./journal.js";
export type {
  JournalEntryDraft,
  JournalEntryValidationCode,
  JournalLineDraft,
  JournalSide,
} from "./journal.js";
