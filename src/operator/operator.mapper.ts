import { Injectable } from '@nestjs/common';
import { OperatorResponseStatus, WalletResponseStatus } from '../common/enums';
import { WalletResponseDto } from '../wallet/dto/wallet-response.dto';
import { OperatorResponseDto } from './dto/operator.dto';

@Injectable()
export class OperatorMapper {
  /**
   * Convert cents to decimal amount for operator
   * Operator expects: 10.50 (dollars)
   * We use: 1050 (cents)
   */
  centsToAmount(cents: number): number {
    return cents / 100;
  }

  /**
   * Convert decimal amount to cents
   */
  amountToCents(amount: number): number {
    return Math.round(amount * 100);
  }

  /**
   * Map operator response to our wallet response format
   */
  mapOperatorResponseToWalletResponse(
    operatorResponse: OperatorResponseDto,
  ): WalletResponseDto {
    const status = this.mapOperatorStatusToWalletStatus(
      operatorResponse.status,
    );
    const balanceCents = this.amountToCents(operatorResponse.balance);

    return {
      status,
      balanceCents,
      reason: operatorResponse.message,
    };
  }

  /**
   * Map operator status to our wallet status
   */
  private mapOperatorStatusToWalletStatus(
    operatorStatus: OperatorResponseStatus,
  ): WalletResponseStatus {
    switch (operatorStatus) {
      case OperatorResponseStatus.SUCCESS:
        return WalletResponseStatus.OK;

      case OperatorResponseStatus.INSUFFICIENT_FUNDS:
      case OperatorResponseStatus.PLAYER_NOT_FOUND:
      case OperatorResponseStatus.INVALID_CURRENCY:
      case OperatorResponseStatus.FAILED:
        return WalletResponseStatus.REJECTED;

      default:
        return WalletResponseStatus.REJECTED;
    }
  }

  /**
   * Map operator status to our transaction status
   */
  mapOperatorStatusToTransactionStatus(
    operatorStatus: OperatorResponseStatus,
  ): 'COMPLETED' | 'REJECTED' | 'FAILED' {
    switch (operatorStatus) {
      case OperatorResponseStatus.SUCCESS:
        return 'COMPLETED';

      case OperatorResponseStatus.INSUFFICIENT_FUNDS:
      case OperatorResponseStatus.PLAYER_NOT_FOUND:
      case OperatorResponseStatus.INVALID_CURRENCY:
        return 'REJECTED';

      case OperatorResponseStatus.FAILED:
      default:
        return 'FAILED';
    }
  }

  /**
   * Get rejection reason from operator response
   */
  getReasonFromOperatorResponse(operatorResponse: OperatorResponseDto): string {
    if (operatorResponse.message) {
      return operatorResponse.message;
    }

    switch (operatorResponse.status) {
      case OperatorResponseStatus.INSUFFICIENT_FUNDS:
        return 'Insufficient funds';
      case OperatorResponseStatus.PLAYER_NOT_FOUND:
        return 'Player not found';
      case OperatorResponseStatus.INVALID_CURRENCY:
        return 'Invalid currency';
      case OperatorResponseStatus.FAILED:
        return 'Transaction failed';
      default:
        return 'Unknown error';
    }
  }
}
