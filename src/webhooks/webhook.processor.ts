import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import { LessThan, Repository } from 'typeorm';
import { WebhookStatus } from '../common/enums';
import { WebhookOutbox } from '../database/entities/webhook-outbox.entity';

@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectRepository(WebhookOutbox)
    private readonly webhookOutboxRepository: Repository<WebhookOutbox>,
    @InjectQueue('webhooks')
    private readonly webhookQueue: Queue,
  ) {}

  /**
   * Process pending webhooks from outbox
   * Runs every 10 seconds
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingWebhooks(): Promise<void> {
    const pendingWebhooks = await this.webhookOutboxRepository.find({
      where: [
        { status: WebhookStatus.PENDING, nextRetryAt: LessThan(new Date()) },
        { status: WebhookStatus.FAILED, nextRetryAt: LessThan(new Date()) },
      ],
      take: 100,
      order: { createdAt: 'ASC' },
    });

    if (pendingWebhooks.length === 0) {
      return;
    }

    this.logger.log({
      message: 'Processing pending webhooks',
      count: pendingWebhooks.length,
    });

    for (const webhook of pendingWebhooks) {
      try {
        webhook.status = WebhookStatus.PROCESSING;
        await this.webhookOutboxRepository.save(webhook);

        // Add to queue
        await this.webhookQueue.add(
          'send-webhook',
          {
            webhookId: webhook.id,
            attempt: webhook.retryCount + 1,
          },
          {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        this.logger.debug({
          message: 'Webhook added to queue',
          webhookId: webhook.id,
          attempt: webhook.retryCount + 1,
        });
      } catch (error) {
        this.logger.error({
          message: 'Failed to add webhook to queue',
          webhookId: webhook.id,
          error: error.message,
        });

        webhook.status = WebhookStatus.FAILED;
        await this.webhookOutboxRepository.save(webhook);
      }
    }
  }

  /**
   * Clean up old delivered webhooks
   * Runs daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupDeliveredWebhooks(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await this.webhookOutboxRepository.delete({
      status: WebhookStatus.DELIVERED,
      deliveredAt: LessThan(sevenDaysAgo),
    });

    this.logger.log({
      message: 'Cleaned up old delivered webhooks',
      deletedCount: result.affected,
    });
  }

  /**
   * Move webhooks to dead letter queue if max retries exceeded
   */
  async handleMaxRetriesExceeded(webhookId: string): Promise<void> {
    const webhook = await this.webhookOutboxRepository.findOne({
      where: { id: webhookId },
    });

    if (!webhook) {
      return;
    }

    webhook.status = WebhookStatus.DEAD_LETTER;
    await this.webhookOutboxRepository.save(webhook);

    this.logger.error({
      message: 'Webhook moved to dead letter queue',
      webhookId,
      retryCount: webhook.retryCount,
    });
  }
}
