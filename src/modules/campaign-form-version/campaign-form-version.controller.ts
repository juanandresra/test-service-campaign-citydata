// src/modules/campaign-form-version/campaign-form-version.controller.ts
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
} from '@nestjs/common';
import { PinoLogger } from 'pino-nestjs';
import { User } from '@src/common/decorators/user.decorator';
import { CampaignFormVersionService } from './campaign-form-version.service';
import { AiFormGeneratorService } from './services/ai-form-generator.service';
import { CreateCampaignFormVersionDto } from './dto/create-campaign-form-version.dto';
import { UpdateCampaignFormVersionDto } from './dto/update-campaign-form-version.dto';
import { GenerateAiFormDto } from './dto/generate-ai-form.dto';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('form-version/:organizationId/:researchId/:campaignId')
export class CampaignFormVersionController {
  constructor(
    private readonly formVersionService: CampaignFormVersionService,
    private readonly aiFormGeneratorService: AiFormGeneratorService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignFormVersionController.name);
  }

  @Get()
  findAll(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.formVersionService.findAll(campaignId);
  }

  @Post('generate-ai')
  generateAiForm(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: GenerateAiFormDto,
  ) {
    return this.aiFormGeneratorService.generateForm(organizationId, dto);
  }

  @Get(':version')
  findOne(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('version') version: string,
  ) {
    return this.formVersionService.findOne(campaignId, version);
  }

  @Post()
  create(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: CreateCampaignFormVersionDto,
    @User() user: IKeycloakUser,
  ) {
    return this.formVersionService.create(campaignId, dto, user.id);
  }

  @Patch(':version')
  update(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('version') version: string,
    @Body() dto: UpdateCampaignFormVersionDto,
  ) {
    return this.formVersionService.update(campaignId, version, dto);
  }

  @Post(':version/publish')
  publish(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('version') version: string,
    @User() user: IKeycloakUser,
  ) {
    return this.formVersionService.publish(campaignId, version, user.id);
  }

  @Post(':version/archive')
  archive(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('version') version: string,
  ) {
    return this.formVersionService.archive(campaignId, version);
  }

  @Delete(':version')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('version') version: string,
  ) {
    return this.formVersionService.remove(campaignId, version);
  }

  @Post(':version/revert')
  revert(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('version') version: string,
  ) {
    return this.formVersionService.revertToDraft(campaignId, version);
  }

  @MessagePattern('find-form-version')
  async findFormVersion(
    @Payload() data: { campaignId: string; version: string },
  ) {
    this.logger.info(
      { campaignId: data.campaignId, version: data.version },
      'Searching form version by campaign and version via message pattern',
    );
    return this.formVersionService.findOne(data.campaignId, data.version);
  }
}
