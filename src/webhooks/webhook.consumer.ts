import { HttpService } from '@nestjs/axios';
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bull';
import { firstValueFrom, timeout } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { WebhookStatus } from '../common/enums';
import { HmacService } from '../common/security/hmac.service';
import { WebhookOutbox } from '../database/entities/webhook-outbox.entity';

@Processor('webhooks')
export class WebhookConsumer {
  private readonly logger = new Logger(WebhookConsumer.name);
  private readonly retryDelays: number[];
  private readonly maxRetries: number;
  private readonly webhookTimeout: number;

  constructor(
    @InjectRepository(WebhookOutbox)
    private readonly webhookOutboxRepository: Repository<WebhookOutbox>,
    private readonly httpService: HttpService,
    private readonly hmacService: HmacService,
    private readonly configService: ConfigService,
  ) {
    const delays =
      this.configService.get<string>('WEBHOOK_RETRY_DELAYS') ||
      '1000,5000,15000,60000,300000';
    this.retryDelays = delays.split(',').map((d) => parseInt(d.trim()));
    this.maxRetries = parseInt(
      this.configService.get<string>('WEBHOOK_MAX_RETRIES') || '5',
    );
    this.webhookTimeout = parseInt(
      this.configService.get<string>('WEBHOOK_TIMEOUT_MS') || '10000',
    );
  }

  @Process('send-webhook')
  async handleSendWebhook(job: Job): Promise<void> {
    const { webhookId, attempt } = job.data;

    this.logger.log({
      message: 'Processing webhook delivery',
      webhookId,
      attempt,
    });

    const webhook = await this.webhookOutboxRepository.findOne({
      where: { id: webhookId },
    });

    if (!webhook) {
      this.logger.error({
        message: 'Webhook not found',
        webhookId,
      });
      return;
    }

    try {
      const { signature, timestamp } = this.hmacService.sign(webhook.payload);
      webhook.signature = signature;

      const response = await firstValueFrom(
        this.httpService
          .post(webhook.targetUrl, webhook.payload, {
            headers: {
              'Content-Type': 'application/json',
              'X-Signature': signature,
              'X-Timestamp': timestamp.toString(),
              'X-Correlation-ID': webhook.correlationId || 'unknown',
              'X-Event-Type': webhook.eventType,
            },
            timeout: this.webhookTimeout,
          })
          .pipe(
            timeout(this.webhookTimeout),
            catchError((error) => {
              throw error;
            }),
          ),
      );

      webhook.status = WebhookStatus.DELIVERED;
      webhook.deliveredAt = new Date();
      webhook.lastAttemptAt = new Date();
      await this.webhookOutboxRepository.save(webhook);

      this.logger.log({
        message: 'Webhook delivered successfully',
        webhookId,
        statusCode: response.status,
        attempt,
      });
    } catch (error) {
      webhook.lastAttemptAt = new Date();
      webhook.retryCount++;
      webhook.lastError = {
        message: error.message,
        statusCode: error.response?.status,
        timestamp: new Date().toISOString(),
      };

      if (webhook.retryCount >= webhook.maxRetries) {
        webhook.status = WebhookStatus.DEAD_LETTER;
        await this.webhookOutboxRepository.save(webhook);

        this.logger.error({
          message: 'Webhook delivery failed - max retries exceeded',
          webhookId,
          retryCount: webhook.retryCount,
          error: error.message,
        });
        return;
      }

      const delayIndex = Math.min(
        webhook.retryCount - 1,
        this.retryDelays.length - 1,
      );
      const delay = this.retryDelays[delayIndex];
      webhook.nextRetryAt = new Date(Date.now() + delay);
      webhook.status = WebhookStatus.FAILED;

      await this.webhookOutboxRepository.save(webhook);

      this.logger.warn({
        message: 'Webhook delivery failed - will retry',
        webhookId,
        retryCount: webhook.retryCount,
        nextRetryAt: webhook.nextRetryAt,
        error: error.message,
        statusCode: error.response?.status,
      });
    }
  }
}
