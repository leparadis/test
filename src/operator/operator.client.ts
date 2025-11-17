import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, retry, timer } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import {
  OperatorDepositRequestDto,
  OperatorResponseDto,
  OperatorWithdrawRequestDto,
} from './dto/operator.dto';

@Injectable()
export class OperatorClient {
  private readonly logger = new Logger(OperatorClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly requestTimeout: number;
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // Exponential backoff

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('OPERATOR_BASE_URL')!;
    this.apiKey = this.configService.get<string>('OPERATOR_API_KEY')!;
    this.requestTimeout = parseInt(
      this.configService.get<string>('OPERATOR_TIMEOUT_MS') || '5000',
    );
  }

  /**
   * Withdraw funds from player account (DEBIT)
   */
  async withdraw(
    playerExternalId: string,
    amount: number,
    currency: string,
    transactionId: string,
    correlationId?: string,
  ): Promise<OperatorResponseDto> {
    const url = `${this.baseUrl}/v2/players/${playerExternalId}/withdraw`;

    const payload: OperatorWithdrawRequestDto = {
      amount,
      currency,
      transactionId,
      description: `Debit transaction ${transactionId}`,
    };

    return this.makeRequest('POST', url, payload, correlationId);
  }

  /**
   * Deposit funds to player account (CREDIT)
   */
  async deposit(
    playerExternalId: string,
    amount: number,
    currency: string,
    transactionId: string,
    correlationId?: string,
  ): Promise<OperatorResponseDto> {
    const url = `${this.baseUrl}/v2/players/${playerExternalId}/deposit`;

    const payload: OperatorDepositRequestDto = {
      amount,
      currency,
      transactionId,
      description: `Credit transaction ${transactionId}`,
    };

    return this.makeRequest('POST', url, payload, correlationId);
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  private async makeRequest(
    method: string,
    url: string,
    data: any,
    correlationId?: string,
  ): Promise<OperatorResponseDto> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'X-Correlation-ID': correlationId || 'unknown',
    };

    this.logger.log({
      message: 'Making request to operator',
      method,
      url,
      correlationId,
    });

    const response = await firstValueFrom(
      this.httpService
        .request({
          method,
          url,
          data,
          headers,
          timeout: this.requestTimeout,
        })
        .pipe(
          timeout(this.requestTimeout),
          retry({
            count: this.maxRetries,
            delay: (error, retryCount) => {
              // Don't retry on 4xx errors (except 429)
              if (
                error.response?.status >= 400 &&
                error.response?.status < 500
              ) {
                if (error.response.status === 429) {
                  return this.handleRateLimit(error, retryCount);
                }
                throw error;
              }

              // Retry on 5xx errors with exponential backoff
              if (error.response?.status >= 500) {
                const delay = this.retryDelays[retryCount - 1] || 5000;
                this.logger.warn({
                  message: 'Retrying request due to 5xx error',
                  retryCount,
                  delay,
                  correlationId,
                });
                return timer(delay);
              }

              throw error;
            },
          }),
          catchError((error) => {
            this.logger.error({
              message: 'Request to operator failed',
              error: error.message,
              status: error.response?.status,
              correlationId,
            });
            throw this.handleOperatorError(error);
          }),
        ),
    );

    this.logger.log({
      message: 'Operator request successful',
      status: response.status,
      correlationId,
    });

    return response.data;
  }

  /**
   * Handle rate limit (429) responses
   */
  private handleRateLimit(error: any, retryCount: number) {
    const retryAfter = error.response?.headers['retry-after'];
    const delay = retryAfter
      ? parseInt(retryAfter) * 1000
      : this.retryDelays[retryCount - 1] || 5000;

    this.logger.warn({
      message: 'Rate limit hit, retrying after delay',
      retryAfter,
      delay,
      retryCount,
    });

    return timer(delay);
  }

  /**
   * Transform operator errors to our format
   */
  private handleOperatorError(error: any): HttpException {
    const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      error.response?.data?.message ||
      error.message ||
      'Operator request failed';

    // Map operator errors to our errors
    if (status === 404) {
      return new HttpException('Player not found', HttpStatus.NOT_FOUND);
    }

    if (status === 422 || status === 400) {
      return new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    if (status === 429) {
      return new HttpException(
        'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (status >= 500) {
      return new HttpException(
        'Operator service unavailable',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return new HttpException(message, status);
  }

  /**
   * Get transaction history from operator (for reconciliation)
   */
  async getTransactionHistory(
    startDate: Date,
    endDate: Date,
    limit = 1000,
  ): Promise<any[]> {
    const url = `${this.baseUrl}/v2/transactions`;

    const params = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: limit.toString(),
    };

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { params, headers }).pipe(
          timeout(this.requestTimeout * 2), // Allow more time for large queries
          catchError((error) => {
            this.logger.error({
              message: 'Failed to fetch transaction history',
              error: error.message,
            });
            throw error;
          }),
        ),
      );

      return response.data.transactions || [];
    } catch (error) {
      this.logger.error(
        'Failed to get transaction history from operator',
        error,
      );
      return [];
    }
  }
}
