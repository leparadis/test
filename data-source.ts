import { config } from 'dotenv';
import { IdempotencyKey } from 'src/database/entities/idempotency-key.entity';
import { Transaction } from 'src/database/entities/transaction.entity';
import { WebhookOutbox } from 'src/database/entities/webhook-outbox.entity';
import { DataSource } from 'typeorm';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'integration_hub',
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.DB_LOGGING === 'true',
  entities: [IdempotencyKey, Transaction, WebhookOutbox],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  subscribers: [],
});
