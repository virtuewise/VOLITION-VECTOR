import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from "class-validator";

export class UpdateOrganizationProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ["https"], require_protocol: true })
  websiteUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string | null;

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
