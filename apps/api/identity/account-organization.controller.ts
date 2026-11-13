import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { WorkOSAuthenticationGuard } from "./workos-authentication.guard.js";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
  type IdentityRequest,
} from "./identity-context.guard.js";
import { AccountOrganizationApplicationService } from "./account-organization.service.js";

/**
 * Lists only active internal organizations already associated with the
 * authenticated account. The response is a discovery aid, not an authorization
 * grant; every tenant operation must revalidate membership and permissions.
 */
@Controller("me/organizations")
@UseGuards(WorkOSAuthenticationGuard, IdentityContextGuard)
export class AccountOrganizationController {
  constructor(
    private readonly organizations: AccountOrganizationApplicationService,
  ) {}

  @Get()
  list(@Req() request: IdentityRequest) {
    return this.organizations.list(requireIdentityPrincipal(request));
  }
}
