import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { FieldResponseDto } from './dto/field-response.dto.js';
import { ListFieldsQueryDto } from './dto/list-fields.query.dto.js';
import { ListSubfieldsQueryDto } from './dto/list-subfields.query.dto.js';
import { ListTopicsQueryDto } from './dto/list-topics.query.dto.js';
import { PaginatedTopicsResponseDto } from './dto/paginated-topics-response.dto.js';
import { SubfieldResponseDto } from './dto/subfield-response.dto.js';
import { TaxonomyTreeFieldDto } from './dto/taxonomy-tree.dto.js';
import { TaxonomyTreeQueryDto } from './dto/taxonomy-tree.query.dto.js';
import { TopicDetailResponseDto } from './dto/topic-detail-response.dto.js';
import { TaxonomyService } from './taxonomy.service.js';

/**
 * Controller exposing read-only REST endpoints for the research taxonomy tree.
 *
 * All routes are public and read from seeded PostgreSQL reference rows.
 */
@ApiTags('taxonomy')
@Public()
@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @ApiOperation({
    summary:
      'Lấy toàn bộ cây phân cấp nghiên cứu (Fields -> Subfields -> Topics)',
  })
  @ApiOkResponse({
    description: 'Cây phân cấp nghiên cứu hoàn chỉnh',
    type: [TaxonomyTreeFieldDto],
  })
  @Get('tree')
  getTree(
    @Query() query: TaxonomyTreeQueryDto,
  ): Promise<TaxonomyTreeFieldDto[]> {
    return this.taxonomyService.getTree(query);
  }

  @ApiOperation({
    summary: 'Liệt kê danh sách các lĩnh vực nghiên cứu cấp 1 (Fields)',
  })
  @ApiOkResponse({
    description: 'Danh sách các lĩnh vực nghiên cứu',
    type: [FieldResponseDto],
  })
  @Get('fields')
  findAllFields(
    @Query() query: ListFieldsQueryDto,
  ): Promise<FieldResponseDto[]> {
    return this.taxonomyService.findAllFields(query);
  }

  @ApiOperation({
    summary:
      'Liệt kê danh sách các phân ngành nghiên cứu (Subfields) theo lĩnh vực',
  })
  @ApiParam({
    name: 'fieldId',
    description: 'Identifier of the parent research field (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Danh sách các phân ngành nghiên cứu',
    type: [SubfieldResponseDto],
  })
  @ApiBadRequestResponse({
    description: 'Tham số định danh hoặc bộ lọc không hợp lệ',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy lĩnh vực nghiên cứu',
  })
  @Get('fields/:fieldId/subfields')
  findSubfieldsByFieldId(
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Query() query: ListSubfieldsQueryDto,
  ): Promise<SubfieldResponseDto[]> {
    return this.taxonomyService.findSubfieldsByFieldId(fieldId, query);
  }

  @ApiOperation({
    summary:
      'Tìm kiếm và phân trang danh sách các chủ đề nghiên cứu cấp 3 (Topics)',
  })
  @ApiOkResponse({
    description: 'Danh sách chủ đề nghiên cứu kèm metadata phân trang',
    type: PaginatedTopicsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Tham số tìm kiếm hoặc phân trang không hợp lệ',
  })
  @Get('topics')
  findAllTopics(
    @Query() query: ListTopicsQueryDto,
  ): Promise<PaginatedTopicsResponseDto> {
    return this.taxonomyService.findAllTopics(query);
  }

  @ApiOperation({
    summary: 'Lấy chi tiết một chủ đề nghiên cứu kèm thông tin cấp cha',
  })
  @ApiParam({
    name: 'topicId',
    description: 'Identifier of the research topic (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Chi tiết chủ đề nghiên cứu kèm cấp cha',
    type: TopicDetailResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Định danh chủ đề nghiên cứu không đúng định dạng UUID',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy chủ đề nghiên cứu',
  })
  @Get('topics/:topicId')
  findOneTopic(
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ): Promise<TopicDetailResponseDto> {
    return this.taxonomyService.findOneTopic(topicId);
  }
}
