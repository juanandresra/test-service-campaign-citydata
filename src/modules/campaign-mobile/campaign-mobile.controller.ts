import { Controller, Get, Param } from '@nestjs/common';
import { PinoLogger } from 'pino-nestjs';

import { User } from '@src/common/decorators/user.decorator';
import {
  CampaignMobileService,
  CampaignMobileCampaignDetail,
} from './campaign-mobile.service';
import { CampaignMobileResponse } from '@src/common/types/campaign-mobile';

@Controller('campaign-mobile')
export class CampaignMobileController {
  constructor(
    private readonly campaignMobileService: CampaignMobileService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignMobileController.name);
  }

  // Devuelve todas las campañas (agrupadas por research) del usuario autenticado
  @Get()
  async findAll(
    @User() user: IKeycloakUser,
  ): Promise<CampaignMobileResponse[]> {
    if (!user.email) {
      this.logger.warn({ user }, 'User email not found');
      throw new Error('User email not found');
    }

    this.logger.info({ email: user.email }, 'Fetching campaigns for user');

    return this.campaignMobileService.findAll(user.email);
  }

  // Filtra las campañas del usuario por research
  @Get('research/:researchId')
  async findByResearchId(
    @User() user: IKeycloakUser,
    @Param('researchId') researchId: string,
  ): Promise<CampaignMobileResponse | null> {
    if (!user.email) {
      this.logger.warn({ user }, 'User email not found');
      throw new Error('User email not found');
    }
    this.logger.info(
      { email: user.email, researchId },
      'Fetching campaigns for user by research ID',
    );

    return this.campaignMobileService.findByResearchId(user.email, researchId);
  }

  // Filtra las campañas del usuario por organización
  @Get('organization/:organizationId')
  async findByOrganizationId(
    @User() user: IKeycloakUser,
    @Param('organizationId') organizationId: string,
  ): Promise<CampaignMobileResponse[]> {
    if (!user.email) {
      this.logger.warn({ user }, 'User email not found');
      throw new Error('User email not found');
    }
    this.logger.info(
      { email: user.email, organizationId },
      'Fetching campaigns for user by organization ID',
    );

    return this.campaignMobileService.findByOrganizationId(
      user.email,
      organizationId,
    );
  }

  // Devuelve una sola campaña puntual del usuario
  // OJO: esta ruta debe ir de última porque ':campaignId' matchea cualquier string
  // y le pisaría las rutas de arriba (research/organization) si estuviera antes
  @Get(':campaignId')
  async findByCampaignId(
    @User() user: IKeycloakUser,
    @Param('campaignId') campaignId: string,
  ): Promise<CampaignMobileCampaignDetail> {
    if (!user.email) {
      this.logger.warn({ user }, 'User email not found');
      throw new Error('User email not found');
    }
    this.logger.info(
      { email: user.email, campaignId },
      'Fetching campaign for user by campaign ID',
    );

    return this.campaignMobileService.findByCampaignId(user.email, campaignId);
  }
}
