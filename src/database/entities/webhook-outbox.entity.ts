import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WebhookEventType, WebhookStatus } from '../../common/enums';

@Entity('webhook_outbox')
@Index(['status'])
@Index(['eventType'])
@Index(['nextRetryAt'])
@Index(['createdAt'])
export class WebhookOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: WebhookEventType,
  })
  eventType: WebhookEventType;

  @Column({ type: 'varchar', length: 255 })
  targetUrl: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({
    type: 'enum',
    enum: WebhookStatus,
    default: WebhookStatus.PENDING,
  })
  status: WebhookStatus;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 5 })
  maxRetries: number;

  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  lastError: any;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transactionId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  correlationId: string;

  @Column({ type: 'text', nullable: true })
  signature: string; // HMAC signature for webhook

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date;
}
