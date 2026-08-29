import { Module } from '@nestjs/common';
import { CampaignPrismaService } from './services/campaign.prisma.service';

@Module({
  providers: [CampaignPrismaService],
  exports: [CampaignPrismaService],
})
export class PrismaModule {}
