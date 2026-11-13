import { ApiProperty } from '@nestjs/swagger';
import { OutputFileVisibility, SearchEntityType } from '@researchos/database';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';

/**
 * A single permission-filtered search result item from `search_index`.
 *
 * The item is deliberately one flat shape for all four entity types: the
 * client branches on `entityType` and picks the field that carries the
 * subtitle for that tab.
 *
 * | `entityType` | title | body | authorsText |
 * | --- | --- | --- | --- |
 * | `OUTPUT` | work title | abstract | author names |
 * | `RESEARCHER` | researcher full name | bio | researcher full name |
 * | `GROUP` | group name | group description | group leader name |
 * | `OPPORTUNITY` | opportunity title | opportunity description | creator name |
 *
 * A typed `subtitle` field was considered and rejected: it would add a
 * field the server has to keep in sync with the index, for a value the
 * client can already pick per tab.
 */
export class SearchResultItemDto {
  @ApiProperty({
    description:
      'Entity category of the indexed record (`OUTPUT`, `RESEARCHER`, `GROUP`, or `OPPORTUNITY`).',
    enum: SearchEntityType,
    example: SearchEntityType.OUTPUT,
  })
  entityType: SearchEntityType;

  @ApiProperty({
    description: 'Primary key UUID of the source entity.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  entityId: string;

  @ApiProperty({
    description:
      'Current released revision UUID when `entityType` is `OUTPUT`; `null` for other entity types.',
    format: 'uuid',
    nullable: true,
    example: '22222222-2222-4222-8222-222222222222',
  })
  revisionId: string | null;

  @ApiProperty({
    description:
      'Owner UUID of the indexed record (output owner, researcher user ID, group lead ID, or opportunity creator ID).',
    format: 'uuid',
    nullable: true,
    example: '33333333-3333-4333-8333-333333333333',
  })
  ownerId: string | null;

  @ApiProperty({
    description:
      'Visibility scope of the indexed record (`PRIVATE`, `RESEARCH_GROUP`, or `FPTU_COMMUNITY`).',
    enum: OutputFileVisibility,
    example: OutputFileVisibility.FPTU_COMMUNITY,
  })
  visibility: OutputFileVisibility;

  @ApiProperty({
    description:
      'Research group UUID scoping access when `visibility` is `RESEARCH_GROUP`; `null` otherwise.',
    format: 'uuid',
    nullable: true,
    example: null,
  })
  accessGroupId: string | null;

  @ApiProperty({
    description: 'Display title of the matched entity.',
    example: 'Deep Learning for Medical Imaging',
  })
  title: string;

  @ApiProperty({
    description:
      'Secondary text of the matched entity (abstract, researcher bio, group description, or opportunity description).',
    nullable: true,
    example: 'A survey of convolutional and transformer architectures...',
  })
  body: string | null;

  @ApiProperty({
    description:
      'Formatted author names, researcher full name, group leader name, or opportunity creator name.',
    nullable: true,
    example: 'Nguyen Van A, Tran Thi B',
  })
  authorsText: string | null;

  @ApiProperty({
    description:
      'Text relevance score computed strictly from `ts_rank` on the full-text vector (`BR-11`, `S-33`).',
    example: 0.0607927,
  })
  rank: number;

  @ApiProperty({
    description: 'Timestamp when the search index entry was last updated.',
    format: 'date-time',
    example: '2026-11-10T12:00:00.000Z',
  })
  updatedAt: string;
}

/**
 * Paginated response payload for `GET /search`.
 */
export class PaginatedSearchResultsResponseDto extends PaginatedResultDto<SearchResultItemDto> {
  @ApiProperty({
    description: 'The search result items belonging to this page.',
    type: [SearchResultItemDto],
  })
  declare items: SearchResultItemDto[];
}
