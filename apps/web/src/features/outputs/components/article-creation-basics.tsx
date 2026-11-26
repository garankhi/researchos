'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import {
  FormSubmitButton,
  FormTextarea,
  FormTextField,
} from '@/components/ui/form';
import type { ArticlePdfUploadStatusDtoMetadata } from '@/lib/api/models/articlePdfUploadStatusDtoMetadata';
import type { CreateArticleDtoFileVisibility } from '@/lib/api/models/createArticleDtoFileVisibility';
import {
  useArticlePdfPreview,
  type ArticlePdfReader,
} from '../hooks/use-article-pdf-preview';
import { ArticleAuthorsField } from './article-authors-field';
import {
  articleBasicsSchema,
  emptyBasics,
  type ArticleBasics,
  type AuthorOption,
} from './article-basics';
import { ArticleIllustration } from './article-illustration';
import { ArticlePdfSummary, ArticlePdfUpload } from './article-pdf-field';
import { ArticlePublicationDate } from './article-publication-date';
import {
  OutputScopePicker,
  type OutputScopeSelection,
} from './output-scope-picker';

export type ArticleDraft = ArticleBasics & {
  uploadId?: string;
  fileVisibility?: CreateArticleDtoFileVisibility;
  suggestedAbstract?: string;
};
type Props = {
  reader: ArticlePdfReader;
  accounts: AuthorOption[];
  onSearchAccounts?: (query: string) => void;
  accountsLoading?: boolean;
  accountsFailed?: boolean;
  onSuggestionTitleChange?: (title: string) => void;
  onSuggestedAbstractChange?: (abstract: string | undefined) => void;
  scope: OutputScopeSelection;
  onScopeChange: (scope: OutputScopeSelection) => void;
  onContinue: (draft: ArticleDraft) => void;
};

export function ArticleCreationBasics({
  reader,
  accounts,
  onSearchAccounts,
  accountsLoading,
  accountsFailed,
  onSuggestionTitleChange,
  onSuggestedAbstractChange,
  scope,
  onScopeChange,
  onContinue,
}: Props) {
  const t = useTranslations('articleBasics');
  const [step, setStep] = useState<'file' | 'basics'>('file');
  const [awaitingTitleBlur, setAwaitingTitleBlur] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const edited = useRef(new Set<string>());
  const [suggestedAbstract, setSuggestedAbstract] = useState<string>();
  const form = useForm<ArticleBasics>({
    resolver: zodResolver(articleBasicsSchema),
    defaultValues: emptyBasics,
  });
  const title = useWatch({ control: form.control, name: 'title' });
  const suggestionTitle = step === 'basics' && !awaitingTitleBlur ? title : '';
  useEffect(() => {
    onSuggestionTitleChange?.(suggestionTitle);
  }, [onSuggestionTitleChange, suggestionTitle]);

  function applyMetadata(data: NonNullable<ArticlePdfUploadStatusDtoMetadata>) {
    for (const key of ['title', 'publicationDate', 'doi'] as const) {
      if (data[key] && !edited.current.has(key)) form.setValue(key, data[key]);
    }
    if (data.authorNames?.length && !edited.current.has('authors'))
      form.setValue(
        'authors',
        data.authorNames.map((displayName) => ({ displayName })),
      );
    setSuggestedAbstract(data.abstract);
    onSuggestedAbstractChange?.(data.abstract);
  }
  const pdf = useArticlePdfPreview(reader, applyMetadata);
  function clearSuggestions() {
    for (const key of ['title', 'publicationDate', 'doi', 'authors'] as const) {
      if (!edited.current.has(key)) form.setValue(key, emptyBasics[key]);
    }
    setSuggestedAbstract(undefined);
    onSuggestedAbstractChange?.(undefined);
  }
  function removeFile() {
    pdf.remove();
    clearSuggestions();
  }
  function show(next: typeof step) {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function uploadFile(file: File, visibility: CreateArticleDtoFileVisibility) {
    clearSuggestions();
    void pdf.upload(file, visibility);
  }
  return (
    <Box minH="100dvh" bg="home.background" color="fg">
      <Box bg="bg.panel" borderBottomWidth="1px" px="4">
        <HStack maxW={step === 'file' ? '3xl' : '6xl'} mx="auto" py="4" gap="3">
          <ArticleIllustration kind="header" />
          <Heading as="h1" ref={heading} tabIndex={-1} size="xl">
            {step === 'file' ? t('addResearch') : t('yourArticle')}
          </Heading>
        </HStack>
      </Box>
      <Box p={{ base: '3', md: '6' }}>
        {step === 'file' ? (
          <ArticlePdfUpload
            pdf={pdf}
            onUpload={uploadFile}
            onRemove={removeFile}
            onSkip={() => {
              removeFile();
              show('basics');
            }}
            onContinue={() => show('basics')}
          />
        ) : (
          <Grid
            maxW="6xl"
            mx="auto"
            alignItems="start"
            gap="5"
            templateColumns={{
              base: 'minmax(0,1fr)',
              lg: 'minmax(0,3fr) minmax(0,1fr)',
            }}
          >
            <FormProvider {...form}>
              <Box bg="bg.panel">
                <form
                  noValidate
                  onChange={(event) => {
                    const target = event.target;
                    if (
                      target instanceof HTMLTextAreaElement ||
                      target instanceof HTMLInputElement
                    ) {
                      if (target.name) edited.current.add(target.name);
                      if (target.name === 'title') setAwaitingTitleBlur(true);
                    }
                  }}
                  onBlur={(event) => {
                    if (
                      event.target instanceof HTMLTextAreaElement &&
                      event.target.name === 'title'
                    ) {
                      setAwaitingTitleBlur(false);
                    }
                  }}
                  onSubmit={form.handleSubmit((values) => {
                    if (pdf.file && (!pdf.uploadId || !pdf.visibility)) return;
                    setAwaitingTitleBlur(false);
                    onContinue({
                      ...values,
                      ...(pdf.file && {
                        uploadId: pdf.uploadId,
                        fileVisibility: pdf.visibility,
                      }),
                      suggestedAbstract,
                    });
                  })}
                >
                  <Stack
                    layerStyle="formFields"
                    gap="6"
                    p={{ base: '5', md: '8' }}
                  >
                    <Stack gap="5" pb="6" borderBottomWidth="1px">
                      <Flex
                        as="dl"
                        align="center"
                        justify="space-between"
                        gap="3"
                      >
                        <Text as="dt" textStyle="sm" fontWeight="bold">
                          {t('type')}
                        </Text>
                        <Badge as="dd" colorPalette="blue" flexShrink="0">
                          {t('article')}
                        </Badge>
                      </Flex>
                      <ArticlePdfSummary file={pdf.file} phase={pdf.phase} />
                    </Stack>
                    <Box>
                      <OutputScopePicker
                        value={scope}
                        onChange={onScopeChange}
                      />
                    </Box>
                    <FormTextarea
                      control={form.control}
                      name="title"
                      label={t('title')}
                      placeholder={t('titlePlaceholder')}
                      maxLength={500}
                      variant="subtle"
                      required
                    />
                    <ArticleAuthorsField
                      options={accounts}
                      onSearch={onSearchAccounts}
                      isLoading={accountsLoading}
                      isFailed={accountsFailed}
                      onEdit={() => edited.current.add('authors')}
                    />
                    <ArticlePublicationDate
                      onEdit={() => edited.current.add('publicationDate')}
                    />
                    <FormTextField
                      control={form.control}
                      name="doi"
                      label={t('doi')}
                      placeholder="10.1234/example"
                      variant="subtle"
                    />
                  </Stack>
                  <Flex
                    p="4"
                    borderTopWidth="1px"
                    gap="3"
                    justify="space-between"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => show('file')}
                    >
                      {t('back')}
                    </Button>
                    <FormSubmitButton
                      mutation={{ isPending: false }}
                      disabled={Boolean(pdf.file && !pdf.uploadId)}
                      label={t('next')}
                    />
                  </Flex>
                </form>
              </Box>
            </FormProvider>
            <Stack
              as="aside"
              hideBelow="lg"
              bg="bg.panel"
              align="center"
              textAlign="center"
              py="8"
              px="5"
              gap="4"
            >
              <ArticleIllustration kind="discovery" />
              <Text>{t('discovery')}</Text>
            </Stack>
          </Grid>
        )}
      </Box>
    </Box>
  );
}
