import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { OperatorResponseStatus } from '../../common/enums';

// Operator Request DTOs
export class OperatorWithdrawRequestDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  currency: string;

  @IsString()
  transactionId: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class OperatorDepositRequestDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  currency: string;

  @IsString()
  transactionId: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// Operator Response DTOs
export class OperatorResponseDto {
  @IsEnum(OperatorResponseStatus)
  status: OperatorResponseStatus;

  @IsString()
  transactionId: string;

  @IsNumber()
  balance: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  message?: string;
}
