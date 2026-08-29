import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

import { CampaignStatus, CampaignType } from '@prisma/campaign/generated/enums';

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CampaignType)
  @IsOptional()
  type?: CampaignType;

  @IsEnum(CampaignStatus)
  @IsOptional()
  status?: CampaignStatus;

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  userEmails?: string[];

  @IsString()
  @IsOptional()
  currentFormVersion?: string;
}
