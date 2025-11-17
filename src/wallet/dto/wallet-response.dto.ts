import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { WalletResponseStatus } from '../../common/enums';

export class WalletResponseDto {
  @IsEnum(WalletResponseStatus)
  status: WalletResponseStatus;

  @IsNumber()
  balanceCents: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
