import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import {
  IdempotencyScope,
  IdempotencyStatus,
  TransactionStatus,
  TransactionType,
  WalletResponseStatus,
  WebhookEventType,
  WebhookStatus,
} from '../common/enums';
import { Transaction } from '../database/entities/transaction.entity';
import { WebhookOutbox } from '../database/entities/webhook-outbox.entity';
import { OperatorClient } from '../operator/operator.client';
import { OperatorMapper } from '../operator/operator.mapper';
import { IdempotencyKey } from './../database/entities/idempotency-key.entity';
import { WalletCreditRequestDto, WalletDebitRequestDto } from './dto/wallet-request.dto';
import { WalletResponseDto } from './dto/wallet-response.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyKeyRepository: Repository<IdempotencyKey>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(WebhookOutbox)
    private readonly webhookOutboxRepository: Repository<WebhookOutbox>,
    private readonly operatorClient: OperatorClient,
    private readonly operatorMapper: OperatorMapper,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Process debit request (withdraw from player)
   */
  async debit(
    dto: WalletDebitRequestDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<WalletResponseDto> {
    this.logger.log({
      message: 'Processing debit request',
      playerId: dto.playerId,
      amountCents: dto.amountCents,
      refId: dto.refId,
      idempotencyKey,
      correlationId,
    });

    return this.processTransaction(
      dto.playerId,
      dto.amountCents,
      dto.currency,
      dto.refId,
      dto.meta,
      TransactionType.DEBIT,
      IdempotencyScope.DEBIT,
      idempotencyKey,
      correlationId,
    );
  }

  /**
   * Process credit request (deposit to player)
   */
  async credit(
    dto: WalletCreditRequestDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<WalletResponseDto> {
    this.logger.log({
      message: 'Processing credit request',
      playerId: dto.playerId,
      amountCents: dto.amountCents,
      refId: dto.refId,
      idempotencyKey,
      correlationId,
    });

    return this.processTransaction(
      dto.playerId,
      dto.amountCents,
      dto.currency,
      dto.refId,
      dto.meta,
      TransactionType.CREDIT,
      IdempotencyScope.CREDIT,
      idempotencyKey,
      correlationId,
    );
  }

  private async processTransaction(
    playerId: string,
    amountCents: number,
    currency: string,
    refId: string,
    meta: any,
    type: TransactionType,
    scope: IdempotencyScope,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<WalletResponseDto> {
    // Check for existing idempotency key
    const existingKey = await this.idempotencyKeyRepository.findOne({
      where: { key: idempotencyKey, scope },
    });

    if (existingKey) {
      if (existingKey.status === IdempotencyStatus.PROCESSING) {
        this.logger.warn({
          message: 'Request is still processing',
          idempotencyKey,
          correlationId,
        });
        throw new ConflictException('Request is already being processed');
      }

      if (existingKey.status === IdempotencyStatus.COMPLETED) {
        this.logger.log({
          message: 'Returning cached response for idempotent request',
          idempotencyKey,
          correlationId,
        });
        return existingKey.response;
      }
    }

    // Check for duplicate refId
    const existingTransaction = await this.transactionRepository.findOne({
      where: { refId },
    });

    if (existingTransaction) {
      this.logger.warn({
        message: 'Duplicate refId detected',
        refId,
        correlationId,
      });
      throw new ConflictException('Transaction with this refId already exists');
    }

    // Start transaction processing
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedTransaction: Transaction;
    let idempotencyRecord: IdempotencyKey;

    try {
      // Create idempotency key record
      idempotencyRecord = this.idempotencyKeyRepository.create({
        key: idempotencyKey,
        scope,
        status: IdempotencyStatus.PROCESSING,
        request: { playerId, amountCents, currency, refId, meta, type },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
      await queryRunner.manager.save(idempotencyRecord);

      // Create transaction record
      const transaction = this.transactionRepository.create({
        refId,
        playerId,
        type,
        amountCents,
        currency,
        status: TransactionStatus.PENDING,
        meta,
        idempotencyKey,
        correlationId,
      });
      savedTransaction = await queryRunner.manager.save(transaction);

      // Update idempotency key with transaction ID
      idempotencyRecord.transactionId = savedTransaction.id;
      await queryRunner.manager.save(idempotencyRecord);

      await queryRunner.commitTransaction();
    } catch (error) {
      // Only rollback if transaction is still active
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Call operator API (outside transaction to avoid long-running tx)
    try {
      // Convert cents to amount for operator
      const amount = this.operatorMapper.centsToAmount(amountCents);

      let operatorResponse;
      if (type === TransactionType.DEBIT) {
        operatorResponse = await this.operatorClient.withdraw(
          playerId,
          amount,
          currency,
          refId,
          correlationId,
        );
      } else {
        operatorResponse = await this.operatorClient.deposit(
          playerId,
          amount,
          currency,
          refId,
          correlationId,
        );
      }

      // Map operator response to wallet response
      const walletResponse = this.operatorMapper.mapOperatorResponseToWalletResponse(operatorResponse);

      // Update transaction with result
      savedTransaction.status = walletResponse.status === WalletResponseStatus.OK
        ? TransactionStatus.COMPLETED
        : TransactionStatus.REJECTED;
      savedTransaction.balanceCents = walletResponse.balanceCents;
      savedTransaction.reason = walletResponse.reason!;
      savedTransaction.operatorTransactionId = operatorResponse.transactionId;
      savedTransaction.completedAt = new Date();

      await this.transactionRepository.save(savedTransaction);

      // Update idempotency key with response
      idempotencyRecord.status = IdempotencyStatus.COMPLETED;
      idempotencyRecord.response = walletResponse;
      await this.idempotencyKeyRepository.save(idempotencyRecord);

      // Create webhook for successful transaction
      await this.createWebhook(savedTransaction);

      this.logger.log({
        message: 'Transaction completed successfully',
        transactionId: savedTransaction.id,
        status: savedTransaction.status,
        correlationId,
      });

      return walletResponse;

    } catch (error) {
      this.logger.error({
        message: 'Operator call failed',
        error: error.message,
        correlationId,
      });

      // Update transaction as failed
      savedTransaction.status = TransactionStatus.FAILED;
      savedTransaction.reason = error.message;
      await this.transactionRepository.save(savedTransaction);

      // Update idempotency key as failed
      idempotencyRecord.status = IdempotencyStatus.FAILED;
      await this.idempotencyKeyRepository.save(idempotencyRecord);

      // Create webhook for failed transaction
      await this.createWebhook(savedTransaction);

      throw error;
    }
  }

  /**
   * Create webhook outbox entry
   */
  private async createWebhook(transaction: Transaction): Promise<void> {
    const eventType = this.getWebhookEventType(transaction.status);

    if (!eventType) {
      return; // Don't send webhooks for pending transactions
    }

    const webhook = this.webhookOutboxRepository.create({
      eventType,
      targetUrl: process.env.RGS_WEBHOOK_URL,
      payload: {
        eventType,
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          transactionId: transaction.id,
          refId: transaction.refId,
          playerId: transaction.playerId,
          type: transaction.type,
          amountCents: transaction.amountCents,
          currency: transaction.currency,
          status: transaction.status,
          balanceCents: transaction.balanceCents,
          reason: transaction.reason,
          meta: transaction.meta,
        },
      },
      status: WebhookStatus.PENDING,
      transactionId: transaction.id,
      correlationId: transaction.correlationId,
      nextRetryAt: new Date(),
    });

    await this.webhookOutboxRepository.save(webhook);

    this.logger.log({
      message: 'Webhook created',
      webhookId: webhook.id,
      eventType,
      transactionId: transaction.id,
    });
  }

  /**
   * Get webhook event type based on transaction status
   */
  private getWebhookEventType(status: TransactionStatus): WebhookEventType | null {
    switch (status) {
      case TransactionStatus.COMPLETED:
        return WebhookEventType.TRANSACTION_COMPLETED;
      case TransactionStatus.FAILED:
        return WebhookEventType.TRANSACTION_FAILED;
      case TransactionStatus.REJECTED:
        return WebhookEventType.TRANSACTION_REJECTED;
      default:
        return null;
    }
  }

  /**
   * Get transaction by refId (for reconciliation)
   */
  async getTransactionByRefId(refId: string): Promise<Transaction | null> {
    return this.transactionRepository.findOne({ where: { refId } });
  }

  /**
   * Get transactions for date range (for reconciliation)
   */
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    return this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.createdAt >= :startDate', { startDate })
      .andWhere('transaction.createdAt <= :endDate', { endDate })
      .orderBy('transaction.createdAt', 'ASC')
      .getMany();
  }
}
