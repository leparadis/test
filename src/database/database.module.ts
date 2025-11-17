import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { Transaction } from './entities/transaction.entity';
import { WebhookOutbox } from './entities/webhook-outbox.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [IdempotencyKey, Transaction, WebhookOutbox],
        synchronize: configService.get('DB_SYNC') === 'true', // Only for development!
        logging: configService.get('DB_LOGGING') === 'true',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([IdempotencyKey, Transaction, WebhookOutbox]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
