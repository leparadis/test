import { Injectable, Logger } from '@nestjs/common';

export interface ReceivedWebhook {
  eventType: string;
  body: any;
  signature: string;
  timestamp: string;
  correlationId: string;
  receivedAt: Date;
}

@Injectable()
export class MockRgsService {
  private readonly logger = new Logger(MockRgsService.name);
  private webhooks: ReceivedWebhook[] = [];
  private errorSimulationCount = 0;

  /**
   * Record received webhook
   */
  recordWebhook(webhook: ReceivedWebhook) {
    this.webhooks.push(webhook);

    this.logger.log({
      message: 'Webhook recorded',
      eventType: webhook.eventType,
      correlationId: webhook.correlationId,
      totalReceived: this.webhooks.length,
    });
  }

  /**
   * Get received webhooks
   */
  getWebhooks(limit: number = 100): ReceivedWebhook[] {
    return this.webhooks.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get webhook count
   */
  getWebhookCount(): number {
    return this.webhooks.length;
  }

  /**
   * Clear webhooks
   */
  clearWebhooks() {
    const count = this.webhooks.length;
    this.webhooks = [];
    this.logger.log(`Cleared ${count} webhooks`);
  }

  /**
   * Set error simulation
   */
  setErrorSimulation(count: number) {
    this.errorSimulationCount = count;
    this.logger.log(`Error simulation set for ${count} webhooks`);
  }

  /**
   * Check if should simulate error
   */
  shouldSimulateError(): boolean {
    if (this.errorSimulationCount > 0) {
      this.errorSimulationCount--;
      return true;
    }
    return false;
  }
}
