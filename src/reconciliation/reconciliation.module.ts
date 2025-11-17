import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../database/entities/transaction.entity';
import { OperatorModule } from '../operator/operator.module';
import { CsvGeneratorService } from './csv-generator.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    ConfigModule,
    OperatorModule,
  ],
  providers: [ReconciliationService, CsvGeneratorService],
  exports: [ReconciliationService, CsvGeneratorService],
})
export class ReconciliationModule {}
