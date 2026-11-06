export type JournalSide = "debit" | "credit";

export interface JournalLineDraft {
  readonly accountCode: string;
  readonly side: JournalSide;
  /**
   * Integer minor units (for example, cents); floating-point amounts are
   * rejected.
   */
  readonly amountMinor: number;
}

export interface JournalEntryDraft {
  readonly idempotencyKey: string;
  readonly referenceType: string;
  readonly referenceId: string;
  /** Three-letter uppercase ISO 4217 currency code. */
  readonly currency: string;
  readonly lines: readonly JournalLineDraft[];
}

export type JournalEntryValidationCode =
  | "invalid_idempotency_key"
  | "invalid_reference"
  | "invalid_currency"
  | "invalid_lines"
  | "invalid_account"
  | "invalid_side"
  | "invalid_amount"
  | "unbalanced_entry";

export class JournalEntryValidationError extends Error {
  constructor(readonly code: JournalEntryValidationCode) {
    super("Journal entry is invalid.");
    this.name = "JournalEntryValidationError";
  }
}

/**
 * Validates the provider-neutral accounting invariant before persistence.
 *
 * This is a pure input contract, not a ledger, persistence adapter, payment
 * processor, or authorization boundary. Callers must still persist the entry
 * and its idempotency key atomically in PostgreSQL.
 */
export function assertBalancedJournalEntry(
  input: JournalEntryDraft,
): void {
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.trim().length < 1 ||
    input.idempotencyKey.length > 128
  ) {
    throw new JournalEntryValidationError("invalid_idempotency_key");
  }

  if (
    typeof input.referenceType !== "string" ||
    input.referenceType.trim().length < 1 ||
    input.referenceType.length > 64 ||
    typeof input.referenceId !== "string" ||
    input.referenceId.trim().length < 1 ||
    input.referenceId.length > 200
  ) {
    throw new JournalEntryValidationError("invalid_reference");
  }

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new JournalEntryValidationError("invalid_currency");
  }

  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new JournalEntryValidationError("invalid_lines");
  }

  let debits = 0n;
  let credits = 0n;

  for (const line of input.lines) {
    if (
      typeof line.accountCode !== "string" ||
      line.accountCode.trim().length < 1 ||
      line.accountCode.length > 64
    ) {
      throw new JournalEntryValidationError("invalid_account");
    }

    if (line.side !== "debit" && line.side !== "credit") {
      throw new JournalEntryValidationError("invalid_side");
    }

    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) {
      throw new JournalEntryValidationError("invalid_amount");
    }

    if (line.side === "debit") {
      debits += BigInt(line.amountMinor);
    } else {
      credits += BigInt(line.amountMinor);
    }
  }

  if (debits === 0n || credits === 0n || debits !== credits) {
    throw new JournalEntryValidationError("unbalanced_entry");
  }
}
