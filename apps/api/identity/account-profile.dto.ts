import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class UpdateAccountProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  @Matches(/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
}
