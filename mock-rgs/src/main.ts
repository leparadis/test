import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MockRgsModule } from './mock-rgs.module';

async function bootstrap() {
  const app = await NestFactory.create(MockRgsModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors();

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`🎮 Mock RGS is running on: http://localhost:${port}`);
}
bootstrap();
