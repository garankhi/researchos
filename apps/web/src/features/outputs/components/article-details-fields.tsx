import { Fieldset, Grid, RadioGroup, Stack } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useController } from 'react-hook-form';
import { z } from 'zod';
import { FormTextarea, FormTextField } from '@/components/ui/form';

const fields = {
  abstract: { limit: 20000, error: 'abstract_too_long' },
  journal: { limit: 255, error: 'venue_too_long' },
  volume: { limit: 50, error: 'article_volume_invalid' },
  issue: { limit: 50, error: 'article_issue_invalid' },
  pages: { limit: 100, error: 'article_pages_invalid' },
} as const;

const peerReviewChoices = ['yes', 'no', 'unspecified'] as const;
const journalFields = ['volume', 'issue', 'pages'] as const;

export const articleDetailsSchema = z.object({
  abstract: z.string().trim().max(fields.abstract.limit, fields.abstract.error),
  journal: z.string().trim().max(fields.journal.limit, fields.journal.error),
  volume: z.string().trim().max(fields.volume.limit, fields.volume.error),
  issue: z.string().trim().max(fields.issue.limit, fields.issue.error),
  pages: z.string().trim().max(fields.pages.limit, fields.pages.error),
  peerReviewed: z.enum(peerReviewChoices),
  topicIds: z.array(z.string()),
});

export type ArticleDetailsValues = z.infer<typeof articleDetailsSchema>;

export function ArticleAbstractField() {
  const t = useTranslations('articleDetails');
  return (
    <FormTextarea
      name="abstract"
      label={t('abstract')}
      placeholder={t('abstractPlaceholder')}
      maxLength={fields.abstract.limit}
      minH="32"
      variant="subtle"
    />
  );
}

export function ArticleJournalFields() {
  const t = useTranslations('articleDetails');
  return (
    <>
      <FormTextField
        name="journal"
        label={t('journal')}
        maxLength={fields.journal.limit}
        variant="subtle"
      />
      <Grid
        templateColumns={{ base: '1fr', sm: 'repeat(3,minmax(0,1fr))' }}
        gap="3"
      >
        {journalFields.map((name) => (
          <FormTextField
            key={name}
            name={name}
            label={t(name)}
            maxLength={fields[name].limit}
            variant="subtle"
          />
        ))}
      </Grid>
    </>
  );
}

export function ArticlePeerReviewField() {
  const t = useTranslations('articleDetails');
  const { field } = useController<ArticleDetailsValues, 'peerReviewed'>({
    name: 'peerReviewed',
  });
  return (
    <Fieldset.Root>
      <Fieldset.Legend>{t('peerReviewed')}</Fieldset.Legend>
      <RadioGroup.Root
        colorPalette="blue"
        variant="outline"
        name={field.name}
        value={field.value}
        onValueChange={({ value }) => field.onChange(value)}
      >
        <Stack gap="2">
          {peerReviewChoices.map((value) => (
            <RadioGroup.Item key={value} value={value}>
              <RadioGroup.ItemHiddenInput />
              <RadioGroup.ItemIndicator
                borderRadius="50%"
                borderColor="border.emphasized"
                _checked={{ color: 'blue.solid', borderColor: 'blue.solid' }}
                css={{ '& .dot': { borderRadius: '50%' } }}
              />
              <RadioGroup.ItemText>{t(value)}</RadioGroup.ItemText>
            </RadioGroup.Item>
          ))}
        </Stack>
      </RadioGroup.Root>
    </Fieldset.Root>
  );
}
