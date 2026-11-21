import { ApiProperty } from '@nestjs/swagger';

/**
 * One published research direction, in the shape the hover card shows it.
 *
 * The card shows the title and the linked taxonomy topic; the direction's
 * own description is left out because the card is a summary, and the
 * full direction is one click away.
 */
export class GroupDirectionPreviewDto {
  @ApiProperty({
    description: 'Published research direction title.',
  })
  title: string;

  @ApiProperty({
    description:
      'Name of the linked taxonomy topic, or null for an unlinked direction.',
    type: String,
    nullable: true,
  })
  topic: string | null;
}

/**
 * The quick information the hover card shows about a research group.
 *
 * This is deliberately smaller than `ResearchGroupResponseDto`: the card
 * shows what the group is and what it works on, and nothing else. The
 * full record is served by the group detail endpoint.
 */
export class GroupPreviewResponseDto {
  @ApiProperty({
    description: 'Display name of the research group.',
  })
  name: string;

  @ApiProperty({
    description: 'Detailed description or research scope of the group.',
    type: String,
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Published research directions, newest first.',
    type: [GroupDirectionPreviewDto],
  })
  directions: GroupDirectionPreviewDto[];
}
