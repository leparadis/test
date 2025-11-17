import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { TransactionStatus, TransactionType } from '../../common/enums';


export class WebhookTransactionData {
  @IsString()
  transactionId: string;

  @IsString()
  refId: string;

  @IsString()
  playerId: string;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber()
  amountCents: number;

  @IsString()
  currency: string;

  @IsEnum(TransactionStatus)
  status: TransactionStatus;

  @IsOptional()
  @IsNumber()
  balanceCents?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;
}

export class WebhookPayloadDto {
  @IsString()
  eventType: string;

  @IsString()
  eventId: string;

  @IsDateString()
  timestamp: string;

  @IsObject()
  data: WebhookTransactionData;
}

// Webhook Consumer DTO (incoming webhooks from operator)
export class IncomingWebhookDto {
  @IsString()
  eventType: string;

  @IsObject()
  payload: any;

  @IsString()
  signature: string;

  @IsString()
  timestamp: string;
}
