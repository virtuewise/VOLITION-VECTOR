import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { isUUID } from "class-validator";
import {
  MEMBERSHIP_MUTATION_COMMAND,
  type AuthenticatedPrincipal,
  type MembershipMutationAction,
  type MembershipMutationCommand,
  type MembershipMutationInput,
  type MembershipMutationResult,
  type MembershipRole,
} from "./identity-membership.contracts.js";

export interface OrganizationMembershipMutationRequest {
  readonly organizationId: string;
  readonly targetAccountId: string;
  readonly action: MembershipMutationAction;
  readonly requestedRole?: MembershipRole;
}

@Injectable()
export class OrganizationMembershipApplicationService {
  constructor(
    @Inject(MEMBERSHIP_MUTATION_COMMAND)
    private readonly command: MembershipMutationCommand,
  ) {}

  async mutate(
    principal: AuthenticatedPrincipal,
    request: OrganizationMembershipMutationRequest,
  ): Promise<MembershipMutationResult> {
    if (!isUUID(principal.accountId)) {
      throw new UnauthorizedException(
        "A verified identity context is required.",
      );
    }
    if (!isUUID(request.organizationId) || !isUUID(request.targetAccountId)) {
      throw new BadRequestException(
        "Valid organization and account IDs are required.",
      );
    }

    const input: MembershipMutationInput = {
      organizationId: request.organizationId.toLowerCase(),
      actorAccountId: principal.accountId.toLowerCase(),
      targetAccountId: request.targetAccountId.toLowerCase(),
      action: request.action,
      ...(request.requestedRole
        ? { requestedRole: request.requestedRole }
        : {}),
    };

    const result = await this.command.mutate(input);
    if (!result) {
      // Keep missing, cross-tenant and denied cases indistinguishable.
      throw new ForbiddenException(
        "Membership mutation is not permitted or available.",
      );
    }
    return result;
  }
}
