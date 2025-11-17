import { Module } from '@nestjs/common';
import { MockRgsController } from './mock-rgs.controller';
import { MockRgsService } from './mock-rgs.service';

@Module({
  controllers: [MockRgsController],
  providers: [MockRgsService],
})
export class MockRgsModule {}
