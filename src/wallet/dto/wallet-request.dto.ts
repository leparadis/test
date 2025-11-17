import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Currency } from '../../common/enums';

export class WalletDebitRequestDto {
  @IsString()
  playerId: string;

  @IsNumber()
  @Min(1)
  amountCents: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsString()
  refId: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;
}

export class WalletCreditRequestDto {
  @IsString()
  playerId: string;

  @IsNumber()
  @Min(1)
  amountCents: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsString()
  refId: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;
}
