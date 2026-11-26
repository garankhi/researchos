'use client';

import { useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { FormProvider, useController, useForm } from 'react-hook-form';
import { FormSubmitButton } from '@/components/ui/form';
import type { CreateArticleDto } from '@/lib/api/models/createArticleDto';
import {
  ArticleAbstractField,
  ArticleJournalFields,
  ArticlePeerReviewField,
  articleDetailsSchema,
  type ArticleDetailsValues,
} from './article-details-fields';
import {
  ArticleDetailsTopics,
  type ArticleTopic,
} from './article-details-topics';
import { ArticleIllustration } from './article-illustration';

export type ArticleDetails = Pick<CreateArticleDto, keyof ArticleDetailsValues>;

export function ArticleCreationDetails({
  suggestedAbstract,
  topics,
  suggestions = [],
  suggestionsLoading = false,
  suggestionsUnavailable = false,
  onAbstractChange,
  onSearchTopics,
  topicsLoading,
  topicsFailed,
  isSubmitting = false,
  submitError,
  onBack,
  onSubmit,
}: {
  suggestedAbstract?: string;
  topics: ArticleTopic[];
  suggestions?: ArticleTopic[];
  suggestionsLoading?: boolean;
  suggestionsUnavailable?: boolean;
  onAbstractChange?: (abstract: string) => void;
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
    resolver: zodResolver(articleDetailsSchema),
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
  const { field: topicIds } = useController({
    name: 'topicIds',
    control: form.control,
  });
  const { setValue } = form;
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
                  onAbstractChange?.(event.target.value);
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
                <ArticleAbstractField />
                <ArticlePeerReviewField />
                <ArticleJournalFields />
                <Box borderTopWidth="1px" pt="5">
                  <ArticleDetailsTopics
                    topics={topics}
                    suggestions={suggestions}
                    suggestionsLoading={suggestionsLoading}
                    suggestionsUnavailable={suggestionsUnavailable}
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
