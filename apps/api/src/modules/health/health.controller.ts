import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';
import { HealthStatusDto } from './dto/health-status.dto.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({ summary: 'Liveness probe for the API process' })
  @ApiOkResponse({ description: 'Service status', type: HealthStatusDto })
  @Get()
  check(): HealthStatusDto {
    return this.healthService.check();
  }

  @ApiOperation({ summary: 'Readiness probe including a database round trip' })
  @ApiOkResponse({ description: 'Service status', type: HealthStatusDto })
  @Get('ready')
  async checkReadiness(): Promise<HealthStatusDto> {
    return this.healthService.checkReadiness();
  }
}
