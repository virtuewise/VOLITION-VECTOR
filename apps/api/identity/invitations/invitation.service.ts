import { createHash, randomBytes } from "node:crypto";

export type InvitationRole = "admin" | "member" | "viewer";

export interface CreateInvitationInput {
  readonly organizationId: string;
  readonly actorAccountId: string;
  readonly invitedEmail: string;
  readonly role: InvitationRole;
}

export interface CreatedInvitation {
  readonly id: string;
  readonly expiresAt: Date;
}

export interface InvitationRepository {
  /**
   * In one transaction, revoke any prior pending invitation for the same
   * organization and normalized email, then persist only the new SHA-256
   * token hash. Serialize concurrent creates for that organization/email.
   * Never persist the raw token.
   */
  createPendingInvitation(input: {
    readonly organizationId: string;
    readonly invitedEmail: string;
    readonly role: InvitationRole;
    readonly tokenHash: Uint8Array;
    readonly invitedByAccountId: string;
    readonly expiresAt: Date;
  }): Promise<CreatedInvitation>;

  /** Revoke only a still-pending invitation after delivery fails. */
  revokePendingInvitation(input: {
    readonly invitationId: string;
    readonly revokedAt: Date;
  }): Promise<void>;

  /**
   * In one database transaction: lock and validate the pending invitation,
   * compare expiry and verified email, create the membership, and mark the
   * invitation accepted. Return false for unknown, expired, revoked, consumed
   * or email-mismatched invitations.
   */
  acceptPendingInvitationAtomically(input: {
    readonly tokenHash: Uint8Array;
    readonly accountId: string;
    readonly verifiedEmail: string;
    readonly acceptedAt: Date;
  }): Promise<boolean>;
}

export interface InvitationAuthorizer {
  /** Must load current membership and apply the organization membership policy. */
  assertCanInvite(input: {
    readonly actorAccountId: string;
    readonly organizationId: string;
    readonly requestedRole: InvitationRole;
  }): Promise<void>;
}

export interface InvitationRateLimiter {
  assertAllowed(input: {
    readonly actorAccountId: string;
    readonly organizationId: string;
    readonly invitedEmail: string;
  }): Promise<void>;
}

export interface InvitationNotifier {
  /**
   * Deliver the raw token only to the invited address. Implementations must
   * never log or persist the token in plaintext.
   */
  sendInvitation(input: {
    readonly invitationId: string;
    readonly organizationId: string;
    readonly invitedEmail: string;
    readonly role: InvitationRole;
    readonly token: string;
    readonly expiresAt: Date;
  }): Promise<void>;
}

export interface InvitationServiceDependencies {
  readonly repository: InvitationRepository;
  readonly authorizer: InvitationAuthorizer;
  readonly rateLimiter: InvitationRateLimiter;
  readonly notifier: InvitationNotifier;
  readonly clock?: () => Date;
  readonly tokenGenerator?: () => string;
}

export interface InvitationIssued {
  readonly invitationId: string;
  readonly expiresAt: Date;
}

export interface AcceptInvitationInput {
  readonly token: string;
  readonly accountId: string;
  /** Must come from the authenticated principal's verified email claim. */
  readonly verifiedEmail: string;
}

export class InvitationInputError extends Error {
  constructor() {
    super("Invitation request is invalid.");
    this.name = "InvitationInputError";
  }
}

export class InvalidInvitationError extends Error {
  constructor() {
    super("Invitation is invalid or no longer available.");
    this.name = "InvalidInvitationError";
  }
}

export class InvitationDeliveryError extends Error {
  constructor(cause?: unknown) {
    super("Invitation delivery could not be completed.", { cause });
    this.name = "InvitationDeliveryError";
  }
}

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash a canonical 32-byte base64url invitation token for bytea storage. */
export function hashInvitationToken(token: string): Uint8Array {
  if (!TOKEN_PATTERN.test(token)) {
    throw new InvalidInvitationError();
  }

  const decoded = Buffer.from(token, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== token) {
    throw new InvalidInvitationError();
  }

  return createHash("sha256").update(decoded).digest();
}

/**
 * Provider-neutral invitation lifecycle orchestration. Persistence and
 * notification adapters are intentionally ports until their production
 * implementations are wired into the API module.
 */
export class InvitationApplicationService {
  private readonly clock: () => Date;
  private readonly tokenGenerator: () => string;

  constructor(private readonly dependencies: InvitationServiceDependencies) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.tokenGenerator =
      dependencies.tokenGenerator ?? generateInvitationToken;
  }

  async createInvitation(
    input: CreateInvitationInput,
  ): Promise<InvitationIssued> {
    const invitedEmail = normalizeEmail(input.invitedEmail);
    if (
      !input.organizationId.trim() ||
      !input.actorAccountId.trim() ||
      !invitedEmail ||
      !["admin", "member", "viewer"].includes(input.role)
    ) {
      throw new InvitationInputError();
    }

    await this.dependencies.authorizer.assertCanInvite({
      actorAccountId: input.actorAccountId,
      organizationId: input.organizationId,
      requestedRole: input.role,
    });
    await this.dependencies.rateLimiter.assertAllowed({
      actorAccountId: input.actorAccountId,
      organizationId: input.organizationId,
      invitedEmail,
    });

    const token = this.tokenGenerator();
    const tokenHash = hashInvitationToken(token);
    const createdAt = this.clock();
    const expiresAt = new Date(createdAt.getTime() + INVITATION_TTL_MS);
    const invitation = await this.dependencies.repository.createPendingInvitation({
      organizationId: input.organizationId,
      invitedEmail,
      role: input.role,
      tokenHash,
      invitedByAccountId: input.actorAccountId,
      expiresAt,
    });

    try {
      await this.dependencies.notifier.sendInvitation({
        invitationId: invitation.id,
        organizationId: input.organizationId,
        invitedEmail,
        role: input.role,
        token,
        expiresAt,
      });
    } catch (deliveryError) {
      try {
        await this.dependencies.repository.revokePendingInvitation({
          invitationId: invitation.id,
          revokedAt: this.clock(),
        });
      } catch (revocationError) {
        throw new InvitationDeliveryError(
          new AggregateError(
            [deliveryError, revocationError],
            "Delivery and pending-invitation revocation both failed.",
          ),
        );
      }
      throw new InvitationDeliveryError(deliveryError);
    }

    return { invitationId: invitation.id, expiresAt };
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<void> {
    const verifiedEmail = normalizeEmail(input.verifiedEmail);
    if (!input.accountId.trim() || !verifiedEmail) {
      throw new InvalidInvitationError();
    }

    const tokenHash = hashInvitationToken(input.token);
    const accepted =
      await this.dependencies.repository.acceptPendingInvitationAtomically({
        tokenHash,
        accountId: input.accountId,
        verifiedEmail,
        acceptedAt: this.clock(),
      });

    if (!accepted) {
      throw new InvalidInvitationError();
    }
  }
}
