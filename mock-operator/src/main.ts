import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MockOperatorModule } from './mock-operator.module';

async function bootstrap() {
  const app = await NestFactory.create(MockOperatorModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(
    `🎰 Mock Operator Wallet API is running on: http://localhost:${port}`,
  );
}
bootstrap();
