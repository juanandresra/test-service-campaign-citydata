// src/modules/campaign-form-version/dto/update-campaign-form-version.dto.ts
import { IsObject, IsOptional } from 'class-validator';

export class UpdateCampaignFormVersionDto {
  @IsOptional()
  @IsObject()
  schema?: object;
}
