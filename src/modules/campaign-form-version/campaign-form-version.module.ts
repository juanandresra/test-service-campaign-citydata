// src/modules/campaign-form-version/campaign-form-version.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaModule } from '../../common/modules/prisma/prisma.module';
import { CampaignFormVersionController } from './campaign-form-version.controller';
import { CampaignFormVersionService } from './campaign-form-version.service';
import { AiFormGeneratorService } from './services/ai-form-generator.service';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: 'ORGANIZATION_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const valkeyUrl = configService.getOrThrow<string>('VALKEY_URL');
          const { hostname, port, username, password, pathname } = new URL(
            valkeyUrl,
          );

          return {
            transport: Transport.REDIS,
            options: {
              host: hostname,
              port: Number(port || 6379),
              username: username || undefined,
              password: password || undefined,
              db:
                pathname && pathname !== '/'
                  ? Number(pathname.slice(1))
                  : undefined,
            },
          };
        },
      },
    ]),
  ],
  controllers: [CampaignFormVersionController],
  providers: [CampaignFormVersionService, AiFormGeneratorService],
})
export class CampaignFormVersionModule {}
