import { createHash } from "node:crypto";
import { normalizeTenantId } from "@volition/database";
import {
  normalizeTenantId,
  withTenantTransaction,
} from "@volition/database";
import type {
  TenantConnectionPool,
  TenantQueryResult,
} from "@volition/database";
import type { InvitationRateLimiter } from "./invitation.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InvitationRateLimitOptions {
  readonly actorWindowMs: number;
  readonly actorMaxAttempts: number;
  readonly emailWindowMs: number;
  readonly emailMaxAttempts: number;
}

export const DEFAULT_INVITATION_RATE_LIMITS: InvitationRateLimitOptions = {
  actorWindowMs: 60 * 60 * 1000,
  actorMaxAttempts: 10,
  emailWindowMs: 24 * 60 * 60 * 1000,
  emailMaxAttempts: 3,
};

export class InvitationRateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Invitation rate limit exceeded.");
    this.name = "InvitationRateLimitExceededError";
  }
}

interface RateLimitRow {
  readonly attempt_count: number | string;
  readonly retry_after_seconds: number | string;
}

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function validateOptions(options: InvitationRateLimitOptions): void {
  if (
    !Number.isSafeInteger(options.actorWindowMs) ||
    options.actorWindowMs < 1_000 ||
    !Number.isSafeInteger(options.actorMaxAttempts) ||
    options.actorMaxAttempts < 1 ||
    !Number.isSafeInteger(options.emailWindowMs) ||
    options.emailWindowMs < 1_000 ||
    !Number.isSafeInteger(options.emailMaxAttempts) ||
    options.emailMaxAttempts < 1
  ) {
    throw new TypeError("Invitation rate-limit options must be positive integers.");
  }
}

function digestScope(scope: "actor" | "email", value: string): Uint8Array {
  return createHash("sha256").update(scope + ":" + value).digest();
}

function upsertScope(
  organizationId: string,
  scope: "actor" | "email",
  scopeHash: Uint8Array,
  windowMs: number,
): readonly unknown[] {
  return [organizationId, scope, scopeHash, windowMs];
}

const UPSERT_RATE_LIMIT = `INSERT INTO organization_invitation_rate_limits
  (organization_id, scope, scope_hash, window_started_at, attempt_count, last_attempt_at)
VALUES ($1, $2, $3, clock_timestamp(), 1, clock_timestamp())
ON CONFLICT (organization_id, scope, scope_hash)
DO UPDATE SET
  attempt_count = CASE
    WHEN organization_invitation_rate_limits.window_started_at <=
      EXCLUDED.window_started_at - ($4::bigint * interval '1 millisecond')
    THEN 1
    ELSE organization_invitation_rate_limits.attempt_count + 1
  END,
  window_started_at = CASE
    WHEN organization_invitation_rate_limits.window_started_at <=
      EXCLUDED.window_started_at - ($4::bigint * interval '1 millisecond')
    THEN EXCLUDED.window_started_at
    ELSE organization_invitation_rate_limits.window_started_at
  END,
  last_attempt_at = EXCLUDED.last_attempt_at
RETURNING
  attempt_count,
  GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (
      window_started_at + ($4::bigint * interval '1 millisecond') - clock_timestamp()
    )))
  )::int AS retry_after_seconds`;

export class PostgresInvitationRateLimiter implements InvitationRateLimiter {
  constructor(
    private readonly pool: TenantConnectionPool,
    private readonly options: InvitationRateLimitOptions =
      DEFAULT_INVITATION_RATE_LIMITS,
  ) {
    validateOptions(options);
  }

  async assertAllowed(input: {
    readonly actorAccountId: string;
    readonly organizationId: string;
    readonly invitedEmail: string;
  }): Promise<void> {
    const organizationId = normalizeTenantId(input.organizationId);
    const actorAccountId = input.actorAccountId.trim().toLowerCase();
    const invitedEmail = input.invitedEmail.trim().toLowerCase();

    if (
      !UUID_PATTERN.test(actorAccountId) ||
      invitedEmail.length > 320 ||
      !EMAIL_PATTERN.test(invitedEmail)
    ) {
      throw new TypeError("A valid actor UUID and normalized invitation email are required.");
    }

    const actorHash = digestScope("actor", actorAccountId);
    const emailHash = digestScope("email", invitedEmail);

    const result = await withTenantTransaction(
      this.pool,
      organizationId,
      async (client) => {
        await client.query(
          "DELETE FROM organization_invitation_rate_limits " +
            "WHERE organization_id = $1 " +
            "AND last_attempt_at < clock_timestamp() - interval '7 days'",
          [organizationId],
        );

        const actor = firstRow<RateLimitRow>(
          await client.query(
            UPSERT_RATE_LIMIT,
            upsertScope(
              organizationId,
              "actor",
              actorHash,
              this.options.actorWindowMs,
            ),
          ),
        );
        const email = firstRow<RateLimitRow>(
          await client.query(
            UPSERT_RATE_LIMIT,
            upsertScope(
              organizationId,
              "email",
              emailHash,
              this.options.emailWindowMs,
            ),
          ),
        );

        if (!actor || !email) {
          throw new Error("Invitation rate-limit counter did not return a row.");
        }

        const actorAttempts = Number(actor.attempt_count);
        const emailAttempts = Number(email.attempt_count);
        const actorRetry = Number(actor.retry_after_seconds);
        const emailRetry = Number(email.retry_after_seconds);
        if (
          !Number.isSafeInteger(actorAttempts) ||
          !Number.isSafeInteger(emailAttempts) ||
          !Number.isSafeInteger(actorRetry) ||
          !Number.isSafeInteger(emailRetry) ||
          actorAttempts < 1 ||
          emailAttempts < 1 ||
          actorRetry < 0 ||
          emailRetry < 0
        ) {
          throw new Error("Invitation rate-limit counter returned invalid state.");
        }

        return {
          blocked:
            actorAttempts > this.options.actorMaxAttempts ||
            emailAttempts > this.options.emailMaxAttempts,
          retryAfterSeconds: Math.max(1, actorRetry, emailRetry),
        };
      },
    );

    if (result.blocked) {
      throw new InvitationRateLimitExceededError(result.retryAfterSeconds);
    }
  }
}
