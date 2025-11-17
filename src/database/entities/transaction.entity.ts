import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransactionStatus, TransactionType } from '../../common/enums';

@Entity('transactions')
@Index(['refId'], { unique: true })
@Index(['playerId'])
@Index(['createdAt'])
@Index(['status'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  refId: string;

  @Column({ type: 'varchar', length: 255 })
  playerId: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'bigint' })
  amountCents: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'bigint', nullable: true })
  balanceCents: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: any;

  @Column({ type: 'varchar', length: 255, nullable: true })
  operatorTransactionId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  correlationId: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;
}
