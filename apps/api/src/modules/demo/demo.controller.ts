import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DemoService } from './demo.service.js';

/**
 * Demo endpoints used to exercise the frontend loading and error states.
 *
 * These exist only to make the UI states reachable on demand:
 * - `/demo/slow` delays its response so the loading state is observable.
 * - `/demo/fail` returns a 5xx so the error state is observable.
 * - `/demo/unstable` alternates between success and failure.
 */
@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @ApiOperation({ summary: 'Returns the greeting after a configurable delay' })
  @ApiQuery({ name: 'delay', required: false, example: 2000 })
  @ApiOkResponse({ description: 'Greeting message', type: String })
  @Get('slow')
  async getSlow(@Query('delay') delay?: string): Promise<string> {
    const ms = Math.min(Number(delay) || 2000, 30_000);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return this.demoService.getGreeting();
  }

  @ApiOperation({
    summary: 'Always fails with a 500 to exercise the error state',
  })
  @Get('fail')
  getFail(): never {
    throw new Error('Intentional demo failure');
  }

  @ApiOperation({ summary: 'Alternates between success and failure' })
  @ApiOkResponse({ description: 'Greeting message', type: String })
  @Get('unstable')
  getUnstable(): string {
    const shouldFail = Math.random() < 0.5;
    if (shouldFail) {
      throw new Error('Intentional demo failure (unstable)');
    }
    return this.demoService.getGreeting();
  }
}
