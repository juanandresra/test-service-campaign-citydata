// src/modules/campaign-mobile/campaign-mobile.module.ts
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from '../../common/modules/prisma/prisma.module';
import { CampaignMobileController } from './campaign-mobile.controller';
import { CampaignMobileService } from './campaign-mobile.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'RESEARCH_SERVICE',
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
  controllers: [CampaignMobileController],
  providers: [CampaignMobileService],
})
export class CampaignMobileModule {}
