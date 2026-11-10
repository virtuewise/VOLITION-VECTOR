import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { WorkOSAuthenticationGuard } from "./workos-authentication.guard.js";
import {
  IdentityContextGuard,
  requireIdentityPrincipal,
  type IdentityRequest,
} from "./identity-context.guard.js";
import { UpdateAccountProfileDto } from "./account-profile.dto.js";
import { AccountProfileApplicationService } from "./account-profile.service.js";

@Controller("me/profile")
@UseGuards(WorkOSAuthenticationGuard, IdentityContextGuard)
export class AccountProfileController {
  constructor(private readonly profiles: AccountProfileApplicationService) {}

  @Get()
  get(@Req() request: IdentityRequest) {
    return this.profiles.get(requireIdentityPrincipal(request));
  }

  @Patch()
  update(
    @Req() request: IdentityRequest,
    @Body() body: UpdateAccountProfileDto,
  ) {
    return this.profiles.update(requireIdentityPrincipal(request), body);
  }
}
