import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'pino-nestjs';
import { User } from '@src/common/decorators/user.decorator';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('campaign/:organizationId/:researchId')
export class CampaignController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignController.name);
  }

  @Get()
  findAll(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('researchId', ParseUUIDPipe) researchId: string,
    @Query('archived') archived: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const archivedFilter =
      archived === undefined ? undefined : archived === 'true';

    return this.campaignService.findAll(organizationId, researchId, {
      archived: archivedFilter,
      search: search || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findOne(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('researchId', ParseUUIDPipe) researchId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignService.findOne({ organizationId, researchId, id });
  }

  @Post()
  create(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('researchId', ParseUUIDPipe) researchId: string,
    @Body() dto: CreateCampaignDto,
    @User() user: IKeycloakUser,
  ) {
    return this.campaignService.create(
      organizationId,
      researchId,
      dto,
      user.id,
    );
  }

  @Patch(':id')
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('researchId', ParseUUIDPipe) researchId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignService.update({ organizationId, researchId, id }, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('researchId', ParseUUIDPipe) researchId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignService.remove({ organizationId, researchId, id });
  }

  @MessagePattern('find-campaign')
  async findCampaign(@Payload() data: { campaignId: string }) {
    this.logger.info(
      { campaignId: data.campaignId },
      'Buscando campaña vía Valkey',
    );

    const campaign = await this.campaignService.findOneById(data.campaignId);

    this.logger.info({ campaign }, 'Resultado de búsqueda de campaña');
    return campaign;
  }
}
