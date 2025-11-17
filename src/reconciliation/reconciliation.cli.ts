import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CsvGeneratorService } from './csv-generator.service';
import { ReconciliationService } from './reconciliation.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const reconciliationService = app.get(ReconciliationService);
  const csvGeneratorService = app.get(CsvGeneratorService);

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let startDate: Date;
    let endDate: Date;

    if (args.length >= 2) {
      // Custom date range: node reconciliation.cli.js 2024-01-01 2024-01-31
      startDate = new Date(args[0]);
      endDate = new Date(args[1]);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error(' Invalid date format. Use: YYYY-MM-DD');
        process.exit(1);
      }
    } else {
      // Default: yesterday
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
    }

    console.log(' Starting reconciliation...');
    console.log(
      `   Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );
    console.log('');

    const report = await reconciliationService.reconcile(startDate, endDate);

    const csvPath = await csvGeneratorService.generateReport(report);

    console.log(' RECONCILIATION SUMMARY');
    console.log('========================');
    console.log(`Total Hub Transactions:      ${report.totalHubTransactions}`);
    console.log(
      `Total Operator Transactions: ${report.totalOperatorTransactions}`,
    );
    console.log(`Matched Transactions:        ${report.matchedTransactions}`);
    console.log(`Mismatches Found:            ${report.mismatchCount}`);
    console.log('');

    if (report.mismatchCount > 0) {
      console.log(' RECONCILIATION FAILED');
      console.log('');
      console.log('Mismatch Breakdown:');

      const missingInOperator = report.mismatches.filter(
        (m) => m.mismatchType === 'MISSING_IN_OPERATOR',
      ).length;
      const missingInHub = report.mismatches.filter(
        (m) => m.mismatchType === 'MISSING_IN_HUB',
      ).length;
      const amountMismatches = report.mismatches.filter(
        (m) => m.mismatchType === 'AMOUNT_MISMATCH',
      ).length;
      const statusMismatches = report.mismatches.filter(
        (m) => m.mismatchType === 'STATUS_MISMATCH',
      ).length;

      if (missingInOperator > 0)
        console.log(`  - Missing in Operator: ${missingInOperator}`);
      if (missingInHub > 0) console.log(`  - Missing in Hub: ${missingInHub}`);
      if (amountMismatches > 0)
        console.log(`  - Amount Mismatches: ${amountMismatches}`);
      if (statusMismatches > 0)
        console.log(`  - Status Mismatches: ${statusMismatches}`);

      console.log('');
      console.log(`Report saved to: ${csvPath}`);
      console.log(
        `📄 Summary saved to: ${csvPath.replace('.csv', '-summary.txt')}`,
      );

      await app.close();
      process.exit(1);
    } else {
      console.log(' RECONCILIATION PASSED');
      console.log('   All transactions match!');
      console.log('');
      console.log(` Report saved to: ${csvPath}`);

      await app.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('Reconciliation failed with error:');
    console.error(error.message);
    console.error('');
    console.error(error.stack);

    await app.close();
    process.exit(1);
  }
}

bootstrap();
