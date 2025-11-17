import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OperatorClient } from './operator.client';
import { OperatorMapper } from './operator.mapper';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [OperatorClient, OperatorMapper],
  exports: [OperatorClient, OperatorMapper],
})
export class OperatorModule {}
