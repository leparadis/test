import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createObjectCsvWriter } from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReconciliationMismatchDto,
  ReconciliationReportDto,
} from './dto/reconciliation.dto';

@Injectable()
export class CsvGeneratorService {
  private readonly logger = new Logger(CsvGeneratorService.name);
  private readonly outputPath: string;

  constructor(private readonly configService: ConfigService) {
    this.outputPath =
      this.configService.get<string>('RECONCILIATION_OUTPUT_PATH') ||
      './reconciliation-reports';

    // Ensure output directory exists
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }
  }

  /**
   * Generate CSV report from reconciliation data
   */
  async generateReport(report: ReconciliationReportDto): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `reconciliation-${timestamp}.csv`;
    const filepath = path.join(this.outputPath, filename);

    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'refId', title: 'Ref ID' },
        { id: 'mismatchType', title: 'Mismatch Type' },
        { id: 'hubPlayerId', title: 'Hub Player ID' },
        { id: 'hubType', title: 'Hub Type' },
        { id: 'hubAmountCents', title: 'Hub Amount (Cents)' },
        { id: 'hubCurrency', title: 'Hub Currency' },
        { id: 'hubStatus', title: 'Hub Status' },
        { id: 'hubCreatedAt', title: 'Hub Created At' },
        { id: 'operatorAmount', title: 'Operator Amount' },
        { id: 'operatorCurrency', title: 'Operator Currency' },
        { id: 'operatorStatus', title: 'Operator Status' },
        { id: 'description', title: 'Description' },
      ],
    });

    const records = this.mapMismatchesToCsvRecords(report.mismatches);

    await csvWriter.writeRecords(records);

    this.logger.log({
      message: 'CSV report generated',
      filepath,
      mismatchCount: report.mismatchCount,
    });

    // Generate summary file
    await this.generateSummaryFile(report, filepath);

    return filepath;
  }

  /**
   * Map mismatches to CSV records
   */
  private mapMismatchesToCsvRecords(
    mismatches: ReconciliationMismatchDto[],
  ): any[] {
    return mismatches.map((mismatch) => ({
      refId: mismatch.refId,
      mismatchType: mismatch.mismatchType,
      hubPlayerId: mismatch.hubRecord?.playerId || 'N/A',
      hubType: mismatch.hubRecord?.type || 'N/A',
      hubAmountCents: mismatch.hubRecord?.amountCents || 'N/A',
      hubCurrency: mismatch.hubRecord?.currency || 'N/A',
      hubStatus: mismatch.hubRecord?.status || 'N/A',
      hubCreatedAt: mismatch.hubRecord?.createdAt || 'N/A',
      operatorAmount: mismatch.operatorRecord?.amount || 'N/A',
      operatorCurrency: mismatch.operatorRecord?.currency || 'N/A',
      operatorStatus: mismatch.operatorRecord?.status || 'N/A',
      description: mismatch.description,
    }));
  }

  /**
   * Generate summary text file alongside CSV
   */
  private async generateSummaryFile(
    report: ReconciliationReportDto,
    csvPath: string,
  ): Promise<void> {
    const summaryPath = csvPath.replace('.csv', '-summary.txt');

    const summary = `
RECONCILIATION REPORT SUMMARY
============================

Report Date: ${report.reportDate}

STATISTICS
----------
Total Hub Transactions: ${report.totalHubTransactions}
Total Operator Transactions: ${report.totalOperatorTransactions}
Matched Transactions: ${report.matchedTransactions}
Mismatches Found: ${report.mismatchCount}

MISMATCH BREAKDOWN
------------------
Missing in Operator: ${report.mismatches.filter((m) => m.mismatchType === 'MISSING_IN_OPERATOR').length}
Missing in Hub: ${report.mismatches.filter((m) => m.mismatchType === 'MISSING_IN_HUB').length}
Amount Mismatches: ${report.mismatches.filter((m) => m.mismatchType === 'AMOUNT_MISMATCH').length}
Status Mismatches: ${report.mismatches.filter((m) => m.mismatchType === 'STATUS_MISMATCH').length}

RESULT
------
${report.mismatchCount === 0 ? 'PASS - No mismatches found' : ` FAIL - ${report.mismatchCount} mismatches found`}

Details available in: ${csvPath}
`;

    fs.writeFileSync(summaryPath, summary.trim());

    this.logger.log({
      message: 'Summary file generated',
      filepath: summaryPath,
    });
  }
}
