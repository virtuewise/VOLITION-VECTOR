import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { WorkOSAuthenticationGuard } from "./workos-authentication.guard.js";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
  type IdentityRequest,
} from "./identity-context.guard.js";
import { UpdateOrganizationProfileDto } from "./organization-profile.dto.js";
import { OrganizationProfileApplicationService } from "./organization-profile.service.js";

@Controller("organizations/:organizationId/profile")
@UseGuards(WorkOSAuthenticationGuard, IdentityContextGuard)
export class OrganizationProfileController {
  constructor(private readonly profiles: OrganizationProfileApplicationService) {}

  @Get()
  get(
    @Req() request: IdentityRequest,
    @Param("organizationId") organizationId: string,
  ) {
    return this.profiles.get(requireIdentityPrincipal(request), organizationId);
  }

  @Patch()
  update(
    @Req() request: IdentityRequest,
    @Param("organizationId") organizationId: string,
    @Body() body: UpdateOrganizationProfileDto,
  ) {
    return this.profiles.update(
      requireIdentityPrincipal(request),
      organizationId,
      body,
    );
  }
}
