// src/modules/campaign-form-version/dto/create-campaign-form-version.dto.ts
import { IsNotEmpty, IsObject, IsString, Matches } from 'class-validator';

export class CreateCampaignFormVersionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'version must be a valid semver (e.g. 1.0.0)',
  })
  version!: string;

  @IsNotEmpty()
  @IsObject()
  schema!: object;
}
