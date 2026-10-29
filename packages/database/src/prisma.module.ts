import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Provides the Prisma client to the whole application.
 *
 * This module is infrastructure only: it knows about the database and about
 * nothing in the business domain. Feature modules import `PrismaService` (or
 * `PrismaModule`) and stay free of driver details.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
