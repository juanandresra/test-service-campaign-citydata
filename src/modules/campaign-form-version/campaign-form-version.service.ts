import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PinoLogger } from 'pino-nestjs';
import { CampaignPrismaService } from '../../common/modules/prisma/services/campaign.prisma.service';
import { CreateCampaignFormVersionDto } from './dto/create-campaign-form-version.dto';
import { UpdateCampaignFormVersionDto } from './dto/update-campaign-form-version.dto';
import { CampaignFormStatus } from '@prisma/campaign/generated/enums';

export const ERRORS = {
  FORM_VERSION_NOT_FOUND: {
    code: 'FORM_VERSION_NOT_FOUND',
    message: 'La versión del formulario no existe.',
  },

  FORM_VERSION_ALREADY_EXISTS: {
    code: 'FORM_VERSION_ALREADY_EXISTS',
    message: 'Ya existe una versión con ese número.',
  },

  FORM_VERSION_NOT_DRAFT: {
    code: 'FORM_VERSION_NOT_DRAFT',
    message: 'Solo las versiones en borrador pueden modificarse o publicarse.',
  },

  FORM_VERSION_ALREADY_ARCHIVED: {
    code: 'FORM_VERSION_ALREADY_ARCHIVED',
    message: 'La versión ya está archivada.',
  },
} as const;

@Injectable()
export class CampaignFormVersionService {
  constructor(
    private readonly prisma: CampaignPrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignFormVersionService.name);
  }

  async findAll(campaignId: string) {
    const versions = await this.prisma.campaignFormVersion.findMany({
      where: {
        campaignId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.debug(
      {
        campaignId,
        count: versions.length,
      },
      'versiones de formulario obtenidas',
    );

    return versions;
  }

  async findOne(campaignId: string, version: string) {
    const formVersion = await this.prisma.campaignFormVersion.findUnique({
      where: {
        campaignId_version: {
          campaignId,
          version,
        },
        deletedAt: null,
      },
    });

    if (!formVersion) {
      this.logger.warn(
        {
          campaignId,
          version,
        },
        'versión de formulario no encontrada',
      );

      throw new NotFoundException(ERRORS.FORM_VERSION_NOT_FOUND);
    }

    return formVersion;
  }

  async create(
    campaignId: string,
    dto: CreateCampaignFormVersionDto,
    actorId: string,
  ) {
    const existing = await this.prisma.campaignFormVersion.findUnique({
      where: {
        campaignId_version: {
          campaignId,
          version: dto.version,
        },
      },
    });

    if (existing) {
      this.logger.warn(
        {
          campaignId,
          version: dto.version,
        },
        'la versión del formulario ya existe',
      );

      throw new ConflictException(ERRORS.FORM_VERSION_ALREADY_EXISTS);
    }

    const started = Date.now();

    const created = await this.prisma.campaignFormVersion.create({
      data: {
        campaignId,
        version: dto.version,
        schema: dto.schema,
        createdBy: actorId,
      },
    });

    this.logger.info(
      {
        campaignId,
        version: dto.version,
        formVersionId: created.id,
        actorId,
        durationMs: Date.now() - started,
      },
      'versión de formulario creada',
    );

    return created;
  }

  async update(
    campaignId: string,
    version: string,
    dto: UpdateCampaignFormVersionDto,
  ) {
    const formVersion = await this.findOne(campaignId, version);

    if (formVersion.status !== CampaignFormStatus.DRAFT) {
      this.logger.warn(
        {
          campaignId,
          version,
          status: formVersion.status,
        },
        'no se puede actualizar una versión que no está en borrador',
      );

      throw new ConflictException(ERRORS.FORM_VERSION_NOT_DRAFT);
    }

    const started = Date.now();

    const updated = await this.prisma.campaignFormVersion.update({
      where: {
        campaignId_version: {
          campaignId,
          version,
        },
      },
      data: {
        schema: dto.schema,
      },
    });

    this.logger.info(
      {
        campaignId,
        version,
        durationMs: Date.now() - started,
      },
      'versión de formulario actualizada',
    );

    return updated;
  }

  async revertToDraft(campaignId: string, version: string) {
    const formVersion = await this.findOne(campaignId, version);

    if (formVersion.status !== CampaignFormStatus.PUBLISHED) {
      this.logger.warn(
        { campaignId, version, status: formVersion.status },
        'solo versiones publicadas pueden revertirse a borrador',
      );
      throw new ConflictException({
        code: 'FORM_VERSION_NOT_PUBLISHED',
        message: 'Solo las versiones publicadas pueden revertirse a borrador.',
      });
    }

    const started = Date.now();

    const reverted = await this.prisma.campaignFormVersion.update({
      where: { campaignId_version: { campaignId, version } },
      data: { status: CampaignFormStatus.DRAFT },
    });

    this.logger.info(
      { campaignId, version, durationMs: Date.now() - started },
      'versión de formulario revertida a borrador',
    );

    return reverted;
  }

  async publish(campaignId: string, version: string, actorId: string) {
    const formVersion = await this.findOne(campaignId, version);

    if (formVersion.status !== CampaignFormStatus.DRAFT) {
      this.logger.warn(
        {
          campaignId,
          version,
          status: formVersion.status,
        },
        'no se puede publicar una versión que no está en borrador',
      );

      throw new ConflictException(ERRORS.FORM_VERSION_NOT_DRAFT);
    }

    const started = Date.now();

    const [published] = await this.prisma.$transaction([
      this.prisma.campaignFormVersion.update({
        where: {
          campaignId_version: {
            campaignId,
            version,
          },
        },
        data: {
          status: CampaignFormStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedBy: actorId,
        },
      }),

      this.prisma.campaign.update({
        where: {
          id: campaignId,
        },
        data: {
          currentFormVersion: version,
        },
      }),
    ]);

    this.logger.info(
      {
        campaignId,
        version,
        actorId,
        durationMs: Date.now() - started,
      },
      'versión de formulario publicada',
    );

    return published;
  }

  async archive(campaignId: string, version: string) {
    const formVersion = await this.findOne(campaignId, version);

    if (formVersion.status === CampaignFormStatus.ARCHIVED) {
      this.logger.warn(
        {
          campaignId,
          version,
        },
        'la versión del formulario ya está archivada',
      );

      throw new ConflictException(ERRORS.FORM_VERSION_ALREADY_ARCHIVED);
    }

    const started = Date.now();

    const archived = await this.prisma.campaignFormVersion.update({
      where: {
        campaignId_version: {
          campaignId,
          version,
        },
      },
      data: {
        status: CampaignFormStatus.ARCHIVED,
      },
    });

    this.logger.info(
      {
        campaignId,
        version,
        durationMs: Date.now() - started,
      },
      'versión de formulario archivada',
    );

    return archived;
  }

  async remove(campaignId: string, version: string) {
    const formVersion = await this.findOne(campaignId, version);

    const started = Date.now();

    // 1. Convertimos el timestamp actual a hexadecimal (ocupa 11 caracteres)
    const hexaTime = started.toString(16);
    const suffix = `-${hexaTime}`; // Ocupa exactamente 12 caracteres (ej: "-17e6b6bb7c0")

    // 2. Calculamos el espacio restante exacto para la versión original (20 - 12 = 8)
    const maxOriginalLength = 20 - suffix.length; // 8 caracteres

    // 3. Cortamos la versión original a máximo 8 caracteres para que todo sume 20 exactos
    const cleanVersion = version.substring(0, maxOriginalLength);

    // 4. Armamos el string final. Ejemplos de comportamiento:
    // Si era "0.0.0" (5 chars)     -> "0.0.0-17e6b6bb7c0"     (17 chars en total)
    // Si era "0.0.0.0.0" (9 chars) -> "0.0.0.0.-17e6b6bb7c0"    (Exactamente 20 chars)
    // Si era "1.0.0-beta" (10 ch)  -> "1.0.0-be-17e6b6bb7c0"   (Exactamente 20 chars)
    const scrambledVersion = `${cleanVersion}${suffix}`;

    const removed = await this.prisma.campaignFormVersion.update({
      where: {
        id: formVersion.id,
      },
      data: {
        version: scrambledVersion,
        deletedAt: new Date(),
      },
    });

    this.logger.info(
      {
        campaignId,
        originalVersion: version,
        newVersion: scrambledVersion,
        durationMs: Date.now() - started,
      },
      'versión de formulario eliminada con sufijo hexadecimal',
    );

    return removed;
  }
}
