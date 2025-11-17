import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { Transaction } from '../database/entities/transaction.entity';
import { WebhookOutbox } from '../database/entities/webhook-outbox.entity';
import { OperatorModule } from '../operator/operator.module';
import { IdempotencyKey } from './../database/entities/idempotency-key.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IdempotencyKey, Transaction, WebhookOutbox]),
    OperatorModule,
    CommonModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
