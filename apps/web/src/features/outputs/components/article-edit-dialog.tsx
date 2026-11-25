import { Badge, Box, Flex, Stack, Text } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useController } from 'react-hook-form';
import { z } from 'zod';
import { FormTextarea, FormTextField } from '@/components/ui/form';
import { FormModal } from '@/components/ui/form-modal';
import { apiErrorCode, apiFieldErrorCodes } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import type { useArticleCatalogs } from '../hooks/use-article-catalogs';
import { ArticleAuthorsField } from './article-authors-field';
import { articleBasicsSchema, type AuthorOption } from './article-basics';
import {
  ArticleAbstractField,
  ArticleJournalFields,
  ArticlePeerReviewField,
  articleDetailsSchema,
} from './article-details-fields';
import {
  ArticleDetailsTopics,
  type ArticleTopic,
} from './article-details-topics';
import { ArticlePublicationDate } from './article-publication-date';

const editAuthorSchema = articleBasicsSchema.shape.authors.element.extend({
  authorId: z.string().optional(),
});
const articleEditSchema = articleBasicsSchema.extend({
  ...articleDetailsSchema.shape,
  authors: z.array(editAuthorSchema).min(1, 'article_authors_invalid'),
});
export type ArticleEditValues = z.infer<typeof articleEditSchema>;

export function ArticleEditDialog({
  open,
  article,
  accounts,
  topics,
  savedTopics,
  catalogs,
  isSubmitting,
  onClose,
  onSave,
}: {
  open: boolean;
  article: ArticleEditValues;
  accounts: AuthorOption[];
  topics: ArticleTopic[];
  savedTopics?: ArticleTopic[];
  catalogs?: ReturnType<typeof useArticleCatalogs>;
  isSubmitting?: boolean;
  onClose: () => void;
  onSave: (values: ArticleEditValues) => void | Promise<void>;
}) {
  const t = useTranslations('articleBasics');
  const edit = useTranslations('articleEdit');
  const common = useTranslations('common');
  const errors = useTranslations('errors');
  const [saveError, setSaveError] = useState<string>();
  const schema = articleEditSchema.extend({
    publicationDate: article.publicationDate
      ? articleEditSchema.shape.publicationDate
      : articleEditSchema.shape.publicationDate.or(z.literal('')),
    authors: article.authors.length
      ? articleEditSchema.shape.authors
      : z.array(editAuthorSchema),
    doi: articleEditSchema.shape.doi.or(z.literal(article.doi)),
  });

  return (
    <FormModal
      open={open}
      onClose={() => {
        setSaveError(undefined);
        onClose();
      }}
      title={edit('title')}
      defaultValues={article}
      resolver={zodResolver(schema)}
      isSubmitting={isSubmitting}
      onSubmit={(values) => {
        setSaveError(undefined);
        return onSave(values);
      }}
      onSubmitError={(error, setFieldError) => {
        const code = apiErrorCode(error);
        const fieldErrors = apiFieldErrorCodes(error) ?? {};
        for (const name of [
          'title',
          'abstract',
          'publicationDate',
          'doi',
          'journal',
          'volume',
          'issue',
          'pages',
          'authors',
        ]) {
          const fieldCode = fieldErrors[name]?.[0];
          if (fieldCode) setFieldError(name, fieldCode);
        }
        const firstFieldCode = Object.values(fieldErrors).flat()[0];
        setSaveError(
          code === 'output_revision_locked'
            ? edit('abstractRevisionChanged')
            : resolveErrorCode(
                errors,
                firstFieldCode ?? code,
                edit('saveFailed'),
              ),
        );
      }}
      submitLabel={common('save')}
      disablePristine
    >
      <Stack layerStyle="formFields" gap="5">
        <Flex as="dl" align="center" justify="space-between" gap="3">
          <Text as="dt" textStyle="sm" fontWeight="bold">
            {t('type')}
          </Text>
          <Badge as="dd" colorPalette="blue" flexShrink="0">
            {t('article')}
          </Badge>
        </Flex>
        <FormTextarea
          name="title"
          label={t('title')}
          variant="subtle"
          maxLength={500}
          required
        />
        <ArticleAuthorsField
          options={accounts}
          onSearch={catalogs?.people.search}
          isLoading={catalogs?.people.isLoading}
          isFailed={catalogs?.people.isFailed}
        />
        <ArticleAbstractField />
        <ArticlePublicationDate />
        <ArticleJournalFields />
        <FormTextField name="doi" label={t('doi')} variant="subtle" />
        <ArticlePeerReviewField />
        <Box borderTopWidth="1px" pt="5">
          <EditTopics
            topics={topics}
            savedTopics={savedTopics}
            catalog={catalogs?.topics}
          />
        </Box>
        {saveError && (
          <Text role="alert" color="fg.error" textStyle="sm">
            {saveError}
          </Text>
        )}
      </Stack>
    </FormModal>
  );
}

function EditTopics({
  topics,
  savedTopics,
  catalog,
}: {
  topics: ArticleTopic[];
  savedTopics?: ArticleTopic[];
  catalog?: ReturnType<typeof useArticleCatalogs>['topics'];
}) {
  const { field } = useController<ArticleEditValues, 'topicIds'>({
    name: 'topicIds',
  });
  return (
    <ArticleDetailsTopics
      topics={topics}
      savedTopics={savedTopics}
      suggestions={[]}
      suggestionsLoading={false}
      suggestionsUnavailable={false}
      selectedIds={field.value}
      onChange={field.onChange}
      onSearch={catalog?.search}
      isLoading={catalog?.isLoading}
      isFailed={catalog?.isFailed}
    />
  );
}
