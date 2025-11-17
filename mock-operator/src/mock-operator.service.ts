import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

interface Player {
  externalId: string;
  balance: number;
  currency: string;
}

export interface Transaction {
  transactionId: string;
  playerExternalId: string;
  type: 'WITHDRAW' | 'DEPOSIT';
  amount: number;
  currency: string;
  status: string;
  timestamp: Date;
}

@Injectable()
export class MockOperatorService {
  private readonly logger = new Logger(MockOperatorService.name);
  private players: Map<string, Player> = new Map();
  private transactions: Transaction[] = [];

  // Error simulation
  private errorSimulation: { type: string; count: number } = {
    type: 'none',
    count: 0,
  };
  private requestCount = 0;

  constructor() {
    // Initialize some mock players
    this.initializeMockPlayers();
  }

  private initializeMockPlayers() {
    const mockPlayers = [
      { externalId: 'player-001', balance: 10000, currency: 'USD' },
      { externalId: 'player-002', balance: 5000, currency: 'EUR' },
      { externalId: 'player-003', balance: 15000, currency: 'GBP' },
      { externalId: 'player-004', balance: 100, currency: 'USD' },
      { externalId: 'player-005', balance: 25000, currency: 'USD' },
    ];

    mockPlayers.forEach((player) => {
      this.players.set(player.externalId, player);
    });

    this.logger.log(`Initialized ${mockPlayers.length} mock players`);
  }

  /**
   * Simulate withdraw (debit)
   */
  withdraw(
    playerExternalId: string,
    amount: number,
    currency: string,
    transactionId: string,
  ) {
    this.requestCount++;

    // Check for error simulation
    this.checkErrorSimulation();

    this.logger.log({
      message: 'Withdraw request',
      playerExternalId,
      amount,
      currency,
      transactionId,
    });

    // Check if transaction already exists (idempotency)
    const existing = this.transactions.find(
      (tx) => tx.transactionId === transactionId,
    );
    if (existing) {
      this.logger.log('Returning existing transaction (idempotent)');
      const player = this.players.get(playerExternalId);
      return {
        status: 'SUCCESS',
        transactionId,
        balance: player?.balance || 0,
        currency,
      };
    }

    // Validate player exists
    const player = this.players.get(playerExternalId);
    if (!player) {
      throw new HttpException(
        { status: 'PLAYER_NOT_FOUND', message: 'Player not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Validate currency
    if (player.currency !== currency) {
      throw new HttpException(
        { status: 'INVALID_CURRENCY', message: 'Currency mismatch' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Check sufficient funds
    if (player.balance < amount) {
      throw new HttpException(
        { status: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Process withdrawal
    player.balance -= amount;
    this.players.set(playerExternalId, player);

    // Record transaction
    const transaction: Transaction = {
      transactionId,
      playerExternalId,
      type: 'WITHDRAW',
      amount,
      currency,
      status: 'SUCCESS',
      timestamp: new Date(),
    };
    this.transactions.push(transaction);

    return {
      status: 'SUCCESS',
      transactionId,
      balance: player.balance,
      currency,
    };
  }

  /**
   * Simulate deposit (credit)
   */
  deposit(
    playerExternalId: string,
    amount: number,
    currency: string,
    transactionId: string,
  ) {
    this.requestCount++;

    // Check for error simulation
    this.checkErrorSimulation();

    this.logger.log({
      message: 'Deposit request',
      playerExternalId,
      amount,
      currency,
      transactionId,
    });

    // Check if transaction already exists (idempotency)
    const existing = this.transactions.find(
      (tx) => tx.transactionId === transactionId,
    );
    if (existing) {
      this.logger.log('Returning existing transaction (idempotent)');
      const player = this.players.get(playerExternalId);
      return {
        status: 'SUCCESS',
        transactionId,
        balance: player?.balance || 0,
        currency,
      };
    }

    // Validate player exists
    const player = this.players.get(playerExternalId);
    if (!player) {
      throw new HttpException(
        { status: 'PLAYER_NOT_FOUND', message: 'Player not found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Validate currency
    if (player.currency !== currency) {
      throw new HttpException(
        { status: 'INVALID_CURRENCY', message: 'Currency mismatch' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Process deposit
    player.balance += amount;
    this.players.set(playerExternalId, player);

    // Record transaction
    const transaction: Transaction = {
      transactionId,
      playerExternalId,
      type: 'DEPOSIT',
      amount,
      currency,
      status: 'SUCCESS',
      timestamp: new Date(),
    };
    this.transactions.push(transaction);

    return {
      status: 'SUCCESS',
      transactionId,
      balance: player.balance,
      currency,
    };
  }

  /**
   * Get transactions for reconciliation
   */
  getTransactions(startDate: Date, endDate: Date, limit: number) {
    const filtered = this.transactions.filter((tx) => {
      return tx.timestamp >= startDate && tx.timestamp <= endDate;
    });

    return {
      transactions: filtered.slice(0, limit),
      total: filtered.length,
    };
  }

  /**
   * Set error simulation
   */
  setErrorSimulation(errorType: string, count: number) {
    this.errorSimulation = { type: errorType, count };
    this.logger.log(`Error simulation set: ${errorType} for ${count} requests`);
  }

  /**
   * Check and trigger error simulation
   */
  private checkErrorSimulation() {
    if (this.errorSimulation.count <= 0) {
      return;
    }

    this.errorSimulation.count--;

    switch (this.errorSimulation.type) {
      case '500':
        throw new HttpException(
          'Internal Server Error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );

      case '502':
        throw new HttpException('Bad Gateway', HttpStatus.BAD_GATEWAY);

      case '503':
        throw new HttpException(
          'Service Unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
        );

      case 'timeout':
        // Simulate timeout by hanging for a long time
        return new Promise((resolve) => setTimeout(resolve, 30000));

      default:
        break;
    }
  }

  /**
   * Get request count (for rate limiting testing)
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset request count
   */
  resetRequestCount() {
    this.requestCount = 0;
  }
}
