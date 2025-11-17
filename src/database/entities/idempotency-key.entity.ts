import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IdempotencyScope, IdempotencyStatus } from '../../common/enums';

@Entity('idempotency_keys')
@Index(['key', 'scope'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({
    type: 'enum',
    enum: IdempotencyScope,
  })
  scope: IdempotencyScope;

  @Column({
    type: 'enum',
    enum: IdempotencyStatus,
    default: IdempotencyStatus.PROCESSING,
  })
  status: IdempotencyStatus;

  @Column({ type: 'jsonb', nullable: true })
  request: any;

  @Column({ type: 'jsonb', nullable: true })
  response: any;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transactionId: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}
