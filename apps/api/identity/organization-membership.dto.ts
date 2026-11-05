import { IsIn } from "class-validator";
import type { MembershipRole } from "./identity-membership.contracts.js";

export class ChangeMembershipRoleDto {
  @IsIn(["owner", "admin", "member", "viewer"])
  role!: MembershipRole;
}
