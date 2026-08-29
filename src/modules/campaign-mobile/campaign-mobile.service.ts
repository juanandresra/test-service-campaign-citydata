import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { PinoLogger } from 'pino-nestjs';

import { CampaignPrismaService } from '../../common/modules/prisma/services/campaign.prisma.service';
import {
  CampaignMobileResponse,
  ResearchResponse,
  OrganizationResponse,
} from '../../common/types/campaign-mobile';

type CampaignWithFormVersions = {
  id: string;
  researchId: string;
  name: string;
  type: string;
  startsAt: Date | null;
  endsAt: Date | null;
  currentFormVersion: string | null;
  formVersions: { schema: unknown }[];
};

// Forma de un solo campaign, sin el wrapper de research/organization
export type CampaignMobileCampaignDetail = {
  id: string;
  name: string;
  type: string;
  startsAt: Date | null;
  endsAt: Date | null;
  currentFormVersion: string | null;
  trackable?: boolean;
  form: unknown;
};

function isFormSchema(value: unknown): value is {
  trackable?: boolean;
  form?: unknown;
} {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class CampaignMobileService {
  constructor(
    @Inject('RESEARCH_SERVICE')
    private readonly researchClient: ClientProxy,

    @Inject('ORGANIZATION_SERVICE')
    private readonly organizationClient: ClientProxy,

    private readonly prisma: CampaignPrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignMobileService.name);
  }

  async findAll(email: string): Promise<CampaignMobileResponse[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        userEmails: {
          has: email,
        },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        formVersions: {
          take: 1,
          where: {
            status: 'PUBLISHED',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.info(
      campaigns.find((c) => c.id === '27a9836c-94af-4706-bea6-45313da87251'),
    );

    return this.buildResponse(campaigns);
  }

  async findByResearchId(
    email: string,
    researchId: string,
  ): Promise<CampaignMobileResponse | null> {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        userEmails: {
          has: email,
        },
        researchId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        formVersions: {
          take: 1,
          where: {
            status: 'PUBLISHED',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.info(
      { email, researchId, count: campaigns.length },
      'Campaigns found for research',
    );

    const [result] = await this.buildResponse(campaigns);

    return result ?? null;
  }

  async findByOrganizationId(
    email: string,
    organizationId: string,
  ): Promise<CampaignMobileResponse[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        userEmails: {
          has: email,
        },
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        formVersions: {
          take: 1,
          where: {
            status: 'PUBLISHED',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.info(
      { email, organizationId, count: campaigns.length },
      'Campaigns found for organization',
    );

    return this.buildResponse(campaigns);
  }

  async findByCampaignId(
    email: string,
    campaignId: string,
  ): Promise<CampaignMobileCampaignDetail> {
    // El where con userEmails ya valida que el campaign esté asignado al usuario
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userEmails: {
          has: email,
        },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        formVersions: {
          take: 1,
          where: {
            status: 'PUBLISHED',
          },
        },
      },
    });

    if (!campaign) {
      this.logger.warn({ email, campaignId }, 'Campaign not found for user');
      throw new Error('Campaign not found');
    }

    return this.mapCampaign(campaign);
  }

  private async buildResponse(
    campaigns: CampaignWithFormVersions[],
  ): Promise<CampaignMobileResponse[]> {
    // Obtiene únicamente los researchId distintos
    const researchIds = Array.from(
      new Set(
        campaigns
          .map((campaign) => campaign.researchId)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    );

    this.logger.info({ researchIds }, 'Unique research ids');

    // Consulta cada research una sola vez
    const researches: ResearchResponse[] = await Promise.all(
      researchIds.map((researchId) =>
        firstValueFrom(
          this.researchClient.send<ResearchResponse, { researchId: string }>(
            'find-research',
            {
              researchId,
            },
          ),
        ),
      ),
    );

    // Obtiene únicamente los organizationId distintos
    const organizationIds = Array.from(
      new Set(
        researches
          .map((research) => research.organizationId)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    );

    this.logger.info({ organizationIds }, 'Unique organization ids');

    // Consulta cada organization una sola vez
    const organizations: OrganizationResponse[] = await Promise.all(
      organizationIds.map((organizationId) =>
        firstValueFrom(
          this.organizationClient.send<
            OrganizationResponse,
            { organizationId: string }
          >('find-organization', {
            organizationId,
          }),
        ),
      ),
    );

    // Mapa de organizations
    const organizationMap = new Map<string, OrganizationResponse>();

    for (const organization of organizations) {
      organizationMap.set(organization.id, organization);
    }

    // Mapa de research por id
    const researchMap = new Map<string, ResearchResponse>();

    for (const research of researches) {
      researchMap.set(research.id, research);
    }

    // Agrupar campañas por research
    const result = new Map<
      string,
      ResearchResponse & {
        campaigns: typeof campaigns;
      }
    >();

    for (const campaign of campaigns) {
      const research = researchMap.get(campaign.researchId);

      if (!research) {
        continue;
      }

      if (!result.has(research.id)) {
        result.set(research.id, {
          ...research,
          campaigns: [],
        });
      }

      result.get(research.id)!.campaigns.push(campaign);
    }

    return Array.from(result.values()).map((research) => ({
      id: research.id,
      organizationId: research.organizationId,
      organizationName:
        organizationMap.get(research.organizationId)?.name ?? null,
      name: research.name,
      details: research.details,
      campaigns: research.campaigns.map((campaign) =>
        this.mapCampaign(campaign),
      ),
    }));
  }

  // Convierte un campaign crudo (con formVersions incluido) a la forma pública,
  // extrayendo el schema del form publicado
  private mapCampaign(
    campaign: CampaignWithFormVersions,
  ): CampaignMobileCampaignDetail {
    const schema = campaign.formVersions[0]?.schema;

    const formSchema = isFormSchema(schema) ? schema : undefined;
    return {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      currentFormVersion: campaign.currentFormVersion,
      trackable: formSchema?.trackable,
      form: formSchema?.form ?? null,
    };
  }
}
