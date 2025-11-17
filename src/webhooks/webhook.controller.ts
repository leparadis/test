import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { HmacGuard } from '../common/security/hmac.guard';
import { IncomingWebhookDto } from './dto/webhook.dto';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  /**
   * POST /webhooks
   * Receive webhooks from external systems (e.g., operator)
   *
   * Headers required:
   * - X-Signature: HMAC signature
   * - X-Timestamp: Unix timestamp in seconds
   * - X-Event-Type: Event type
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(HmacGuard)
  async receiveWebhook(
    @Body() dto: IncomingWebhookDto,
    @Headers('x-event-type') eventType: string,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ received: boolean }> {
    this.logger.log({
      message: 'Webhook received',
      eventType,
      correlationId,
    });

    // Process webhook (could be added to a queue for async processing)
    // For now, just acknowledge receipt

    this.logger.debug({
      message: 'Webhook payload',
      eventType,
      payload: dto.payload,
      correlationId,
    });

    return { received: true };
  }
}
