import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { MockRgsService } from './mock-rgs.service';

@Controller()
export class MockRgsController {
  private readonly logger = new Logger(MockRgsController.name);

  constructor(private readonly mockRgsService: MockRgsService) {}

  /**
   * POST /webhooks
   * Receive webhooks from Integration Hub
   */
  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  receiveWebhook(
    @Body() body: any,
    @Headers('x-signature') signature: string,
    @Headers('x-timestamp') timestamp: string,
    @Headers('x-correlation-id') correlationId: string,
    @Headers('x-event-type') eventType: string,
  ) {
    this.logger.log({
      message: 'Webhook received',
      eventType,
      correlationId,
      hasSignature: !!signature,
    });

    // Store webhook for inspection
    this.mockRgsService.recordWebhook({
      eventType,
      body,
      signature,
      timestamp,
      correlationId,
      receivedAt: new Date(),
    });

    // Check if we should simulate error
    if (this.mockRgsService.shouldSimulateError()) {
      this.logger.warn('Simulating webhook failure');
      throw new Error('Simulated webhook failure');
    }

    return { received: true, correlationId };
  }

  /**
   * GET /webhooks
   * Get received webhooks for inspection
   */
  @Get('webhooks')
  getWebhooks(@Query('limit') limit?: string) {
    return this.mockRgsService.getWebhooks(limit ? parseInt(limit) : 100);
  }

  /**
   * POST /simulate/error
   * Simulate webhook errors for testing retry logic
   */
  @Post('simulate/error')
  @HttpCode(HttpStatus.OK)
  simulateError(@Body() body: { count?: number }) {
    this.mockRgsService.setErrorSimulation(body.count || 1);
    return {
      message: `Will simulate error for next ${body.count || 1} webhook(s)`,
    };
  }

  /**
   * DELETE /webhooks
   * Clear webhook history
   */
  @Post('webhooks/clear')
  @HttpCode(HttpStatus.OK)
  clearWebhooks() {
    this.mockRgsService.clearWebhooks();
    return { message: 'Webhook history cleared' };
  }

  /**
   * GET /health
   * Health check
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      webhooksReceived: this.mockRgsService.getWebhookCount(),
    };
  }
}
