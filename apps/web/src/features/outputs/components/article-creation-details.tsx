'use client';

import { useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Fieldset,
  Flex,
  Grid,
  Heading,
  HStack,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import {
  FormProvider,
  useController,
  useForm,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';
import {
  FormSubmitButton,
  FormTextarea,
  FormTextField,
} from '@/components/ui/form';
import type { CreateArticleDto } from '@/lib/api/models/createArticleDto';
import { useArticleTopicSuggestions } from '../hooks/use-article-topic-suggestions';
import {
  ArticleDetailsTopics,
  type ArticleTopic,
} from './article-details-topics';
import { ArticleIllustration } from './article-illustration';

const fields = {
  abstract: { limit: 20000, error: 'abstract_too_long' },
  journal: { limit: 255, error: 'venue_too_long' },
  volume: { limit: 50, error: 'article_volume_invalid' },
  issue: { limit: 50, error: 'article_issue_invalid' },
  pages: { limit: 100, error: 'article_pages_invalid' },
} as const;

const detailsSchema = z.object({
  abstract: z.string().trim().max(fields.abstract.limit, fields.abstract.error),
  journal: z.string().trim().max(fields.journal.limit, fields.journal.error),
  volume: z.string().trim().max(fields.volume.limit, fields.volume.error),
  issue: z.string().trim().max(fields.issue.limit, fields.issue.error),
  pages: z.string().trim().max(fields.pages.limit, fields.pages.error),
  peerReviewed: z.enum(['unspecified', 'yes', 'no']),
  topicIds: z.array(z.string()),
});

export type ArticleDetails = Pick<
  CreateArticleDto,
  keyof typeof fields | 'peerReviewed' | 'topicIds'
>;

export function ArticleCreationDetails({
  suggestedAbstract,
  suggestionContext,
  topics,
  suggestions,
  suggestionsUnavailable = false,
  onSearchTopics,
  topicsLoading,
  topicsFailed,
  isSubmitting = false,
  submitError,
  onBack,
  onSubmit,
}: {
  suggestedAbstract?: string;
  suggestionContext?: { userId: string; title: string };
  topics: ArticleTopic[];
  suggestions?: ArticleTopic[];
  suggestionsUnavailable?: boolean;
  onSearchTopics?: (query: string) => void;
  topicsLoading?: boolean;
  topicsFailed?: boolean;
  isSubmitting?: boolean;
  submitError?: string;
  onBack: () => void;
  onSubmit: (details: ArticleDetails) => void;
}) {
  const t = useTranslations('articleDetails');
  const abstractEdited = useRef(false);
  const form = useForm({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      abstract: suggestedAbstract ?? '',
      journal: '',
      volume: '',
      issue: '',
      pages: '',
      peerReviewed: 'unspecified',
      topicIds: [],
    },
  });
  const { field: peerReview } = useController({
    name: 'peerReviewed',
    control: form.control,
  });
  const { field: topicIds } = useController({
    name: 'topicIds',
    control: form.control,
  });
  const { setValue } = form;
  const abstract = useWatch({ control: form.control, name: 'abstract' });
  const topicSuggestions = useArticleTopicSuggestions(
    suggestionContext,
    abstract,
  );
  useEffect(() => {
    if (!abstractEdited.current) setValue('abstract', suggestedAbstract ?? '');
  }, [setValue, suggestedAbstract]);

  return (
    <Box minH="100dvh" bg="home.background" color="fg">
      <Box bg="bg.panel" borderBottomWidth="1px" px="4">
        <HStack maxW="3xl" mx="auto" py="4" gap="3">
          <ArticleIllustration kind="header" />
          <Text fontSize="xl" fontWeight="semibold">
            {t('header')}
          </Text>
        </HStack>
      </Box>
      <Box px={{ base: '3', md: '6' }} py={{ base: '4', md: '8' }}>
        <Box bg="bg.panel" maxW="3xl" mx="auto">
          <FormProvider {...form}>
            <form
              noValidate
              onInput={(event) => {
                if (
                  event.target instanceof HTMLTextAreaElement &&
                  event.target.name === 'abstract'
                ) {
                  abstractEdited.current = true;
                }
              }}
              onSubmit={form.handleSubmit((values) => {
                const {
                  abstract,
                  journal,
                  volume,
                  issue,
                  pages,
                  peerReviewed,
                  topicIds,
                } = values;
                onSubmit({
                  ...(abstract && { abstract }),
                  ...(journal && { journal }),
                  ...(volume && { volume }),
                  ...(issue && { issue }),
                  ...(pages && { pages }),
                  ...(peerReviewed !== 'unspecified' && {
                    peerReviewed: peerReviewed === 'yes',
                  }),
                  ...(topicIds.length > 0 && { topicIds }),
                });
              })}
            >
              <Stack layerStyle="formFields" gap="6" p={{ base: '5', md: '8' }}>
                <Stack gap="1">
                  <Heading as="h1" size="xl">
                    {t('title')}
                  </Heading>
                  <Text color="fg.muted">{t('hint')}</Text>
                </Stack>
                <FormTextarea
                  name="abstract"
                  label={t('abstract')}
                  placeholder={t('abstractPlaceholder')}
                  maxLength={fields.abstract.limit}
                  minH="32"
                  variant="subtle"
                />
                <Fieldset.Root>
                  <Fieldset.Legend>{t('peerReviewed')}</Fieldset.Legend>
                  <RadioGroup.Root
                    colorPalette="blue"
                    variant="outline"
                    name={peerReview.name}
                    value={peerReview.value}
                    onValueChange={({ value }) => peerReview.onChange(value)}
                  >
                    <Stack gap="2">
                      {(['yes', 'no', 'unspecified'] as const).map((value) => (
                        <RadioGroup.Item key={value} value={value}>
                          <RadioGroup.ItemHiddenInput />
                          <RadioGroup.ItemIndicator
                            borderRadius="50%"
                            borderColor="border.emphasized"
                            _checked={{
                              color: 'blue.solid',
                              borderColor: 'blue.solid',
                            }}
                            css={{ '& .dot': { borderRadius: '50%' } }}
                          />
                          <RadioGroup.ItemText>{t(value)}</RadioGroup.ItemText>
                        </RadioGroup.Item>
                      ))}
                    </Stack>
                  </RadioGroup.Root>
                </Fieldset.Root>
                <FormTextField
                  name="journal"
                  label={t('journal')}
                  maxLength={fields.journal.limit}
                  variant="subtle"
                />
                <Grid
                  templateColumns={{
                    base: '1fr',
                    sm: 'repeat(3,minmax(0,1fr))',
                  }}
                  gap="3"
                >
                  <FormTextField
                    name="volume"
                    label={t('volume')}
                    maxLength={fields.volume.limit}
                    variant="subtle"
                  />
                  <FormTextField
                    name="issue"
                    label={t('issue')}
                    maxLength={fields.issue.limit}
                    variant="subtle"
                  />
                  <FormTextField
                    name="pages"
                    label={t('pages')}
                    maxLength={fields.pages.limit}
                    variant="subtle"
                  />
                </Grid>
                <Box borderTopWidth="1px" pt="5">
                  <ArticleDetailsTopics
                    topics={topics}
                    suggestions={suggestions ?? topicSuggestions.items}
                    suggestionsLoading={topicSuggestions.loading}
                    suggestionsUnavailable={
                      suggestionsUnavailable || topicSuggestions.unavailable
                    }
                    selectedIds={topicIds.value}
                    onChange={topicIds.onChange}
                    onSearch={onSearchTopics}
                    isLoading={topicsLoading}
                    isFailed={topicsFailed}
                  />
                </Box>
                {submitError && (
                  <Text role="alert" color="fg.error">
                    {submitError}
                  </Text>
                )}
              </Stack>
              <Flex
                borderTopWidth="1px"
                p="4"
                justify="space-between"
                gap="2"
                wrap="wrap"
              >
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={onBack}
                >
                  {t('back')}
                </Button>
                <Flex gap="2" wrap="wrap" justify="flex-end" ms="auto">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSubmitting}
                    onClick={() => onSubmit({})}
                  >
                    {t('skip')}
                  </Button>
                  <FormSubmitButton
                    mutation={{ isPending: isSubmitting }}
                    label={t('add')}
                  />
                </Flex>
              </Flex>
            </form>
          </FormProvider>
        </Box>
      </Box>
    </Box>
  );
}
