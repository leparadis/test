import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HmacGuard } from '../common/security/hmac.guard';
import { RateLimitGuard } from './../../mock-operator/src/rate-limit.guard';
import {
  WalletCreditRequestDto,
  WalletDebitRequestDto,
} from './dto/wallet-request.dto';
import { WalletResponseDto } from './dto/wallet-response.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  /**
   * POST /wallet/debit
   * Debit funds from player account
   *
   * Headers required:
   * - Idempotency-Key: Unique key for idempotency
   * - X-Signature: HMAC signature
   * - X-Timestamp: Unix timestamp in seconds
   */
  @Post('debit')
  @UseGuards(HmacGuard, RateLimitGuard)
  async debit(
    @Body() dto: WalletDebitRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() request: any,
  ): Promise<WalletResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const correlationId = request.correlationId || 'unknown';

    this.logger.log({
      message: 'Debit request received',
      playerId: dto.playerId,
      amountCents: dto.amountCents,
      refId: dto.refId,
      idempotencyKey,
      correlationId,
    });

    return this.walletService.debit(dto, idempotencyKey, correlationId);
  }

  /**
   * POST /wallet/credit
   * Credit funds to player account
   *
   * Headers required:
   * - Idempotency-Key: Unique key for idempotency
   * - X-Signature: HMAC signature
   * - X-Timestamp: Unix timestamp in seconds
   */
  @Post('credit')
  @UseGuards(HmacGuard, RateLimitGuard)
  async credit(
    @Body() dto: WalletCreditRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() request: any,
  ): Promise<WalletResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const correlationId = request.correlationId || 'unknown';

    this.logger.log({
      message: 'Credit request received',
      playerId: dto.playerId,
      amountCents: dto.amountCents,
      refId: dto.refId,
      idempotencyKey,
      correlationId,
    });

    return this.walletService.credit(dto, idempotencyKey, correlationId);
  }
}
