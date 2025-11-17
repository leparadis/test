import { Module } from '@nestjs/common';
import {
  MockOperatorController,
  MockOperatorTransactionsController,
} from './mock-operator.controller';
import { MockOperatorService } from './mock-operator.service';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  controllers: [MockOperatorController, MockOperatorTransactionsController],
  providers: [MockOperatorService, RateLimitGuard],
})
export class MockOperatorModule {}
