import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TransactionStatus, TransactionType } from '../../common/enums';

export class ReconciliationRecordDto {
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

  @IsDateString()
  createdAt: string;

  @IsOptional()
  @IsString()
  operatorTransactionId?: string;
}

export class ReconciliationMismatchDto {
  @IsString()
  refId: string;

  @IsString()
  mismatchType: string;

  @IsOptional()
  hubRecord?: ReconciliationRecordDto;

  @IsOptional()
  operatorRecord?: any;

  @IsString()
  description: string;
}

export class ReconciliationReportDto {
  @IsDateString()
  reportDate: string;

  @IsNumber()
  totalHubTransactions: number;

  @IsNumber()
  totalOperatorTransactions: number;

  @IsNumber()
  matchedTransactions: number;

  @IsNumber()
  mismatchCount: number;

  mismatches: ReconciliationMismatchDto[];
}
