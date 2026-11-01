import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // Nest/BullMQ close the consumer and Redis connections during shutdown.
  app.enableShutdownHooks();
  new Logger('WorkerBootstrap').log('Queue worker started');
}
await bootstrap();
