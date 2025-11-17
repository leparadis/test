import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { TransactionStatus } from '../common/enums';
import { Transaction } from '../database/entities/transaction.entity';
import { OperatorClient } from '../operator/operator.client';
import {
  ReconciliationMismatchDto,
  ReconciliationRecordDto,
  ReconciliationReportDto,
} from './dto/reconciliation.dto';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly operatorClient: OperatorClient,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Run reconciliation for a date range
   */
  async reconcile(
    startDate: Date,
    endDate: Date,
  ): Promise<ReconciliationReportDto> {
    this.logger.log({
      message: 'Starting reconciliation',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    const hubTransactions = await this.getHubTransactions(startDate, endDate);
    this.logger.log({
      message: 'Fetched Hub transactions',
      count: hubTransactions.length,
    });

    const operatorTransactions = await this.getOperatorTransactions(
      startDate,
      endDate,
    );
    this.logger.log({
      message: 'Fetched Operator transactions',
      count: operatorTransactions.length,
    });

    const hubMap = new Map<string, Transaction>();
    const operatorMap = new Map<string, any>();

    // Index by refId
    hubTransactions.forEach((tx) => {
      hubMap.set(tx.refId, tx);
    });

    operatorTransactions.forEach((tx) => {
      // Assuming operator uses our refId as their transactionId
      operatorMap.set(tx.transactionId, tx);
    });

    // Find mismatches
    const mismatches: ReconciliationMismatchDto[] = [];

    // Check for missing transactions in Operator
    for (const [refId, hubTx] of hubMap.entries()) {
      // Only check completed transactions
      if (hubTx.status !== TransactionStatus.COMPLETED) {
        continue;
      }

      const operatorTx = operatorMap.get(refId);

      if (!operatorTx) {
        mismatches.push({
          refId,
          mismatchType: 'MISSING_IN_OPERATOR',
          hubRecord: this.mapTransactionToDto(hubTx),
          description: `Transaction ${refId} exists in Hub but not found in Operator`,
        });
        continue;
      }

      const hubAmountDecimal = hubTx.amountCents / 100;
      if (Math.abs(hubAmountDecimal - operatorTx.amount) > 0.01) {
        mismatches.push({
          refId,
          mismatchType: 'AMOUNT_MISMATCH',
          hubRecord: this.mapTransactionToDto(hubTx),
          operatorRecord: operatorTx,
          description: `Amount mismatch: Hub=${hubAmountDecimal}, Operator=${operatorTx.amount}`,
        });
      }

      if (!this.isStatusMatching(hubTx.status, operatorTx.status)) {
        mismatches.push({
          refId,
          mismatchType: 'STATUS_MISMATCH',
          hubRecord: this.mapTransactionToDto(hubTx),
          operatorRecord: operatorTx,
          description: `Status mismatch: Hub=${hubTx.status}, Operator=${operatorTx.status}`,
        });
      }
    }

    for (const [transactionId, operatorTx] of operatorMap.entries()) {
      if (!hubMap.has(transactionId)) {
        mismatches.push({
          refId: transactionId,
          mismatchType: 'MISSING_IN_HUB',
          operatorRecord: operatorTx,
          description: `Transaction ${transactionId} exists in Operator but not found in Hub`,
        });
      }
    }

    // Calculate matched count
    const matchedCount =
      Math.max(hubTransactions.length, operatorTransactions.length) -
      mismatches.length;

    const report: ReconciliationReportDto = {
      reportDate: new Date().toISOString(),
      totalHubTransactions: hubTransactions.length,
      totalOperatorTransactions: operatorTransactions.length,
      matchedTransactions: matchedCount,
      mismatchCount: mismatches.length,
      mismatches,
    };

    this.logger.log({
      message: 'Reconciliation completed',
      totalHub: hubTransactions.length,
      totalOperator: operatorTransactions.length,
      matched: matchedCount,
      mismatches: mismatches.length,
    });

    return report;
  }

  /**
   * Get Hub transactions for date range
   */
  private async getHubTransactions(
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: {
        createdAt: Between(startDate, endDate),
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  /**
   * Get Operator transactions for date range
   */
  private async getOperatorTransactions(
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    try {
      const limit = parseInt(
        this.configService.get<string>('RECONCILIATION_FETCH_LIMIT') || '1000',
      );
      return await this.operatorClient.getTransactionHistory(
        startDate,
        endDate,
        limit,
      );
    } catch (error) {
      this.logger.error({
        message: 'Failed to fetch operator transactions',
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Map Transaction entity to DTO
   */
  private mapTransactionToDto(tx: Transaction): ReconciliationRecordDto {
    return {
      refId: tx.refId,
      playerId: tx.playerId,
      type: tx.type,
      amountCents: tx.amountCents,
      currency: tx.currency,
      status: tx.status,
      createdAt: tx.createdAt.toISOString(),
      operatorTransactionId: tx.operatorTransactionId,
    };
  }

  /**
   * Check if Hub status matches Operator status
   */
  private isStatusMatching(
    hubStatus: TransactionStatus,
    operatorStatus: string,
  ): boolean {
    // Map operator status to our status
    const statusMap: Record<string, TransactionStatus[]> = {
      SUCCESS: [TransactionStatus.COMPLETED],
      COMPLETED: [TransactionStatus.COMPLETED],
      FAILED: [TransactionStatus.FAILED],
      REJECTED: [TransactionStatus.REJECTED],
      PENDING: [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
    };

    const matchingStatuses = statusMap[operatorStatus] || [];
    return matchingStatuses.includes(hubStatus);
  }

  /**
   * Run daily reconciliation (for yesterday)
   */
  async runDailyReconciliation(): Promise<ReconciliationReportDto> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    return this.reconcile(yesterday, endOfYesterday);
  }
}
