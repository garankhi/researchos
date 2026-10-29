import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Still an HTTP app: no BullMQ processor is registered yet, so an
  // application context would exit immediately. Switch to
  // `NestFactory.createApplicationContext(AppModule)` together with the
  // first queue processor.
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
