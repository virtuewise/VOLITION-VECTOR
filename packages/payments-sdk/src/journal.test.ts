import { describe, expect, it } from "vitest";
import {
  assertBalancedJournalEntry,
  type JournalEntryDraft,
} from "./journal.js";

const balancedEntry: JournalEntryDraft = {
  idempotencyKey: "provider-event-001",
  referenceType: "payment_capture",
  referenceId: "capture-001",
  currency: "EUR",
  lines: [
    { accountCode: "provider_clearing", side: "debit", amountMinor: 12500 },
    { accountCode: "customer_payable", side: "credit", amountMinor: 12500 },
  ],
};

describe("assertBalancedJournalEntry", () => {
  it("accepts balanced integer minor-unit entries", () => {
    expect(() => assertBalancedJournalEntry(balancedEntry)).not.toThrow();
  });

  it("accepts multiple debit and credit lines when totals balance", () => {
    expect(() =>
      assertBalancedJournalEntry({
        ...balancedEntry,
        lines: [
          { accountCode: "cash", side: "debit", amountMinor: 10000 },
          { accountCode: "fee_expense", side: "debit", amountMinor: 2500 },
          { accountCode: "customer_payable", side: "credit", amountMinor: 12500 },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects an unbalanced entry", () => {
    expect(() =>
      assertBalancedJournalEntry({
        ...balancedEntry,
        lines: [
          { accountCode: "cash", side: "debit", amountMinor: 12500 },
          { accountCode: "customer_payable", side: "credit", amountMinor: 12499 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "unbalanced_entry" }));
  });

  it("rejects entries with fewer than two lines", () => {
    expect(() =>
      assertBalancedJournalEntry({
        ...balancedEntry,
        lines: [balancedEntry.lines[0]!],
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_lines" }));
  });

  it("rejects fractional, zero, negative and unsafe minor-unit amounts", () => {
    for (const amountMinor of [1.25, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        assertBalancedJournalEntry({
          ...balancedEntry,
          lines: [
            { accountCode: "cash", side: "debit", amountMinor },
            { accountCode: "payable", side: "credit", amountMinor },
          ],
        }),
      ).toThrow(expect.objectContaining({ code: "invalid_amount" }));
    }
  });

  it("rejects invalid currencies and missing account codes", () => {
    expect(() =>
      assertBalancedJournalEntry({ ...balancedEntry, currency: "eur" }),
    ).toThrow(expect.objectContaining({ code: "invalid_currency" }));

    expect(() =>
      assertBalancedJournalEntry({
        ...balancedEntry,
        lines: [
          { accountCode: " ", side: "debit", amountMinor: 10 },
          { accountCode: "payable", side: "credit", amountMinor: 10 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_account" }));
  });

  it("requires both debit and credit sides", () => {
    expect(() =>
      assertBalancedJournalEntry({
        ...balancedEntry,
        lines: [
          { accountCode: "cash", side: "debit", amountMinor: 100 },
          { accountCode: "fee", side: "debit", amountMinor: 100 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "unbalanced_entry" }));
  });
});
