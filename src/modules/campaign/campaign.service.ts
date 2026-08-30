import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'pino-nestjs';
import { ClientProxy } from '@nestjs/microservices/client/client-proxy';
import { firstValueFrom } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { CampaignPrismaService } from '../../common/modules/prisma/services/campaign.prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

type PermissionType = 'STRING' | 'NUMBER' | 'BOOLEAN';
type PermissionTuple = [key: string, type: PermissionType, value: string];

@Injectable()
export class CampaignService {
  constructor(
    @Inject('VALKEY_SERVICE')
    private readonly valkeyClient: ClientProxy,
    private readonly prisma: CampaignPrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignService.name);
  }

  async findAll(
    organizationId: string,
    researchId: string,
    {
      archived,
      search,
      page,
      limit,
    }: {
      archived?: boolean;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const where = {
      organizationId,
      researchId,
      deletedAt: null,
      ...(archived !== undefined && {
        status: archived ? ('ARCHIVED' as const) : { not: 'ARCHIVED' as const },
      }),
      ...(search && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
    };

    // Sin page/limit: devuelve el arreglo completo (comportamiento actual, usado por otros consumidores)
    if (page === undefined || limit === undefined) {
      const campaigns = await this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      this.logger.debug(
        {
          organizationId,
          researchId,
          archived,
          search,
          count: campaigns.length,
        },
        'campaigns fetched',
      );

      return campaigns;
    }

    // Con page/limit: devuelve resultado paginado
    const skip = (page - 1) * limit;

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    this.logger.debug(
      {
        organizationId,
        researchId,
        archived,
        search,
        page,
        limit,
        count: campaigns.length,
        total,
      },
      'campaigns fetched (paginated)',
    );

    return {
      data: campaigns,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAllMobile(email: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        userEmails: { has: email },
      },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns;
  }

  async findOne({
    organizationId,
    researchId,
    id,
  }: {
    organizationId: string;
    researchId: string;
    id: string;
  }) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id, organizationId, researchId },
    });

    if (!campaign) {
      this.logger.warn(
        { organizationId, researchId, id },
        'campaign not found',
      );
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    return campaign;
  }

  async findOneById(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      this.logger.warn({ id }, 'campaign not found by id');
      return null;
    }

    return campaign;
  }

  /**
   * Consulta los permisos/features activos de una organización a través
   * del microservicio de Valkey. Incluye timeout para no quedar colgado
   * si el servicio no responde, y logging de error con contexto.
   */
  private async getOrganizationActiveFeatures(
    organizationId: string,
  ): Promise<PermissionTuple[]> {
    this.logger.debug(
      { organizationId },
      'requesting active permissions from valkey',
    );

    const permissions = await firstValueFrom(
      this.valkeyClient
        .send<PermissionTuple[]>('find-organization-active-features', {
          organizationId,
        })
        .pipe(
          timeout(5000),
          catchError((err: unknown) => {
            this.logger.error(
              {
                organizationId,
                err: err instanceof Error ? err.message : err,
              },
              'error fetching active permissions from valkey',
            );
            throw err;
          }),
        ),
    );

    this.logger.debug(
      { organizationId, permissions },
      'active permissions received from valkey',
    );

    return permissions;
  }

  /** Busca un permiso puntual dentro del listado y devuelve su valor parseado, o undefined si no existe. */
  private getFeatureValue(
    permissions: PermissionTuple[],
    key: string,
  ): string | number | boolean | undefined {
    const permission = permissions.find(
      ([permissionKey]) => permissionKey === key,
    );
    if (!permission) return undefined;

    const [, type, value] = permission;
    switch (type) {
      case 'NUMBER':
        return Number(value);
      case 'BOOLEAN':
        return value === 'true';
      case 'STRING':
      default:
        return value;
    }
  }

  async create(
    organizationId: string,
    researchId: string,
    dto: CreateCampaignDto,
    actorId: string,
  ) {
    const started = Date.now();

    let permissions: PermissionTuple[] = [];
    try {
      permissions = await this.getOrganizationActiveFeatures(organizationId);
    } catch (err) {
      this.logger.warn(
        { organizationId, err: err instanceof Error ? err.message : err },
        'Could not fetch active features from membership service, proceeding without plan limits',
      );
    }

    // Límite de campañas por research (estudio)
    const campaignMax = this.getFeatureValue(permissions, 'CAMPAIGNMAX');
    if (typeof campaignMax === 'number') {
      const currentByResearch = await this.prisma.campaign.count({
        where: { organizationId, researchId, deletedAt: null },
      });

      this.logger.debug(
        { organizationId, researchId, campaignMax, currentByResearch },
        'validating CAMPAIGNMAX limit',
      );

      if (currentByResearch >= campaignMax) {
        this.logger.warn(
          { organizationId, researchId, campaignMax, currentByResearch },
          'CAMPAIGNMAX limit reached, blocking campaign creation',
        );
        throw new BadRequestException(
          `Se alcanzó el límite máximo de campañas (${campaignMax}) para este estudio`,
        );
      }
    }

    // Límite de campañas por organización (total, sin importar el research)
    const campaignMaxTotal = this.getFeatureValue(
      permissions,
      'CAMPAIGNMAXTOTAL',
    );
    if (typeof campaignMaxTotal === 'number') {
      const currentByOrganization = await this.prisma.campaign.count({
        where: { organizationId, deletedAt: null },
      });

      this.logger.debug(
        {
          organizationId,
          campaignMaxTotal,
          currentByOrganization,
        },
        'validating CAMPAIGNMAXTOTAL limit',
      );

      if (currentByOrganization >= campaignMaxTotal) {
        this.logger.warn(
          { organizationId, campaignMaxTotal, currentByOrganization },
          'CAMPAIGNMAXTOTAL limit reached, blocking campaign creation',
        );
        throw new BadRequestException(
          `Se alcanzó el límite máximo de campañas (${campaignMaxTotal}) para esta organización`,
        );
      }
    }

    // Límite de usuarios asignados por campaña
    const userMax = this.getFeatureValue(permissions, 'USERMAX');
    const userEmails = dto.userEmails ?? [];
    if (typeof userMax === 'number' && userEmails.length > userMax) {
      this.logger.warn(
        { organizationId, researchId, userMax, requested: userEmails.length },
        'USERMAX limit exceeded, blocking campaign creation',
      );
      throw new BadRequestException(
        `Se supera el máximo de usuarios permitidos por campaña (${userMax})`,
      );
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        ...dto,
        userEmails,
        organizationId,
        researchId,
        createdBy: actorId,
      },
    });

    this.logger.info(
      {
        organizationId,
        researchId,
        campaignId: campaign.id,
        type: campaign.type,
        actorId,
        durationMs: Date.now() - started,
      },
      'campaign created',
    );

    return campaign;
  }

  async update(
    {
      organizationId,
      researchId,
      id,
    }: { organizationId: string; researchId: string; id: string },
    dto: UpdateCampaignDto,
  ) {
    await this.findOne({ organizationId, researchId, id });

    // Si se están actualizando los usuarios asignados, se revalida USERMAX
    if (dto.userEmails) {
      const permissions =
        await this.getOrganizationActiveFeatures(organizationId);
      const userMax = this.getFeatureValue(permissions, 'USERMAX');

      if (typeof userMax === 'number' && dto.userEmails.length > userMax) {
        this.logger.warn(
          {
            organizationId,
            researchId,
            campaignId: id,
            userMax,
            requested: dto.userEmails.length,
          },
          'USERMAX limit exceeded, blocking campaign update',
        );
        throw new BadRequestException(
          `Se supera el máximo de usuarios permitidos por campaña (${userMax})`,
        );
      }
    }

    const started = Date.now();

    const updated = await this.prisma.campaign.update({
      where: { id, organizationId, researchId },
      data: dto,
    });

    this.logger.info(
      {
        organizationId,
        researchId,
        campaignId: id,
        fields: Object.keys(dto),
        durationMs: Date.now() - started,
      },
      'campaign updated',
    );

    return updated;
  }

  async remove({
    organizationId,
    researchId,
    id,
  }: {
    organizationId: string;
    researchId: string;
    id: string;
  }) {
    await this.findOne({ organizationId, researchId, id });

    const started = Date.now();

    const removed = await this.prisma.campaign.update({
      where: { id, organizationId, researchId },
      data: { deletedAt: new Date() },
    });

    this.logger.info(
      {
        organizationId,
        researchId,
        campaignId: id,
        durationMs: Date.now() - started,
      },
      'campaign deleted',
    );

    return removed;
  }
}
