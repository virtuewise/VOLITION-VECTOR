import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  MembershipMutationResult,
  MembershipRole,
} from "./identity-membership.contracts.js";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
  type IdentityRequest,
} from "./identity-context.guard.js";
import { ChangeMembershipRoleDto } from "./organization-membership.dto.js";
import { OrganizationMembershipApplicationService } from "./organization-membership.service.js";

@Controller("organizations/:organizationId/members")
@UseGuards(IdentityContextGuard)
export class OrganizationMembershipController {
  constructor(
    private readonly memberships: OrganizationMembershipApplicationService,
  ) {}

  @Patch(":targetAccountId/role")
  changeRole(
    @Req() request: IdentityRequest,
    @Param("organizationId") organizationId: string,
    @Param("targetAccountId") targetAccountId: string,
    @Body() body: ChangeMembershipRoleDto,
  ): Promise<MembershipMutationResult> {
    return this.memberships.mutate(requireIdentityPrincipal(request), {
      organizationId,
      targetAccountId,
      action: "change-role",
      requestedRole: body.role as MembershipRole,
    });
  }

  @Post(":targetAccountId/suspend")
  suspend(
    @Req() request: IdentityRequest,
    @Param("organizationId") organizationId: string,
    @Param("targetAccountId") targetAccountId: string,
  ): Promise<MembershipMutationResult> {
    return this.memberships.mutate(requireIdentityPrincipal(request), {
      organizationId,
      targetAccountId,
      action: "suspend",
    });
  }

  @Post(":targetAccountId/revoke")
  revoke(
    @Req() request: IdentityRequest,
    @Param("organizationId") organizationId: string,
    @Param("targetAccountId") targetAccountId: string,
  ): Promise<MembershipMutationResult> {
    return this.memberships.mutate(requireIdentityPrincipal(request), {
      organizationId,
      targetAccountId,
      action: "revoke",
    });
  }

  @Post(":targetAccountId/reactivate")
  reactivate(
    @Req() request: IdentityRequest,
    @Param("organizationId") organizationId: string,
    @Param("targetAccountId") targetAccountId: string,
  ): Promise<MembershipMutationResult> {
    return this.memberships.mutate(requireIdentityPrincipal(request), {
      organizationId,
      targetAccountId,
      action: "reactivate",
    });
  }
}
