import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MockOperatorService } from './mock-operator.service';
import { RateLimitGuard } from './rate-limit.guard';

@Controller('v2/players')
export class MockOperatorController {
  constructor(private readonly mockOperatorService: MockOperatorService) {}

  /**
   * POST /v2/players/:playerExternalId/withdraw
   * Simulate player withdrawal (our debit)
   */
  @Post(':playerExternalId/withdraw')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  withdraw(
    @Param('playerExternalId') playerExternalId: string,
    @Body() body: any,
  ) {
    return this.mockOperatorService.withdraw(
      playerExternalId,
      body.amount,
      body.currency,
      body.transactionId,
    );
  }

  /**
   * POST /v2/players/:playerExternalId/deposit
   * Simulate player deposit (our credit)
   */
  @Post(':playerExternalId/deposit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  deposit(
    @Param('playerExternalId') playerExternalId: string,
    @Body() body: any,
  ) {
    return this.mockOperatorService.deposit(
      playerExternalId,
      body.amount,
      body.currency,
      body.transactionId,
    );
  }

  /**
   * POST /v2/simulate/error
   * Endpoint to simulate different error scenarios for testing
   */
  @Post('simulate/error')
  @HttpCode(HttpStatus.OK)
  simulateError(@Body() body: { errorType: string; count?: number }) {
    this.mockOperatorService.setErrorSimulation(
      body.errorType,
      body.count || 1,
    );
    return {
      message: `Will simulate ${body.errorType} for next ${body.count || 1} request(s)`,
    };
  }
}

@Controller('v2')
export class MockOperatorTransactionsController {
  constructor(private readonly mockOperatorService: MockOperatorService) {}

  /**
   * GET /v2/transactions
   * Get transaction history for reconciliation
   */
  @Get('transactions')
  @HttpCode(HttpStatus.OK)
  getTransactions(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('limit') limit?: string,
  ) {
    return this.mockOperatorService.getTransactions(
      new Date(startDate),
      new Date(endDate),
      limit ? parseInt(limit) : 1000,
    );
  }
}
