'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiErrorCode, apiFieldErrorCodes } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { articlePdfReader } from '../hooks/article-pdf-reader';
import { useArticleCatalogs } from '../hooks/use-article-catalogs';
import { useArticleTopicSuggestions } from '../hooks/use-article-topic-suggestions';
import { useCreateArticle } from '../hooks/use-create-article';
import {
  ArticleCreationBasics,
  type ArticleDraft,
} from './article-creation-basics';
import {
  ArticleCreationDetails,
  type ArticleDetails,
} from './article-creation-details';
import { ArticleCreationSuccess } from './article-creation-success';
import { type OutputScopeSelection } from './output-scope-picker';

type Success = {
  outputId: string;
  addedAt: string;
  hasOptionalDetails: boolean;
};

export function ArticleCreationFlow({ userId }: { userId: string }) {
  const t = useTranslations('articleDetails');
  const tErrors = useTranslations('errors');
  const [step, setStep] = useState<'basics' | 'details' | 'success'>('basics');
  const [draft, setDraft] = useState<Omit<ArticleDraft, 'suggestedAbstract'>>();
  const [scope, setScope] = useState<OutputScopeSelection>({
    scopeType: 'PERSONAL',
  });
  const [abstract, setAbstract] = useState<string>();
  const [editedAbstract, setEditedAbstract] = useState<string>();
  const [suggestionTitle, setSuggestionTitle] = useState('');
  const [result, setResult] = useState<Success>();
  const [submitError, setSubmitError] = useState<string>();
  const activeScreen = useRef<HTMLElement>(null);
  const { people, topics } = useArticleCatalogs(
    step === 'basics',
    step === 'details',
    userId,
  );
  const { create, isPending } = useCreateArticle();
  const topicSuggestions = useArticleTopicSuggestions(
    step === 'success'
      ? undefined
      : {
          userId,
          title: step === 'details' ? (draft?.title ?? '') : suggestionTitle,
        },
    editedAbstract ?? abstract ?? '',
    step === 'basics' ? 0 : 500,
  );

  useEffect(() => {
    const visibleHeading = [
      ...(activeScreen.current?.querySelectorAll('h1') ?? []),
    ].find((item) => !item.closest('[hidden]'));
    if (visibleHeading) {
      visibleHeading.tabIndex = -1;
      visibleHeading.focus();
    }
  }, [step]);

  async function publish(details: ArticleDetails) {
    if (!draft) return;
    setSubmitError(undefined);
    try {
      const article = await create({
        ...draft,
        ...details,
        // The scope travels with the Article: it names the container that
        // owns the post and so decides who may change its audience later.
        scope: {
          scopeType: scope.scopeType,
          ...(scope.scopeGroupId && { scopeGroupId: scope.scopeGroupId }),
          ...(scope.scopeProjectId && {
            scopeProjectId: scope.scopeProjectId,
          }),
        },
      });
      if (!article) return;
      setResult({
        outputId: article.outputId,
        addedAt: new Date().toISOString(),
        hasOptionalDetails: Object.keys(details).length > 0,
      });
      setStep('success');
    } catch (error) {
      const fieldError = Object.values(
        apiFieldErrorCodes(error) ?? {},
      ).flat()[0];
      setSubmitError(
        resolveErrorCode(
          tErrors,
          fieldError ?? apiErrorCode(error),
          t('submitFailed'),
        ),
      );
    }
  }

  return (
    <main ref={activeScreen}>
      {step === 'success' && result ? (
        <ArticleCreationSuccess
          {...result}
          onAddMore={() => {
            setDraft(undefined);
            setAbstract(undefined);
            setEditedAbstract(undefined);
            setSuggestionTitle('');
            setResult(undefined);
            people.search('');
            topics.search('');
            setStep('basics');
          }}
        />
      ) : (
        <>
          <div hidden={step !== 'basics'}>
            <ArticleCreationBasics
              reader={articlePdfReader}
              accounts={people.items}
              onSearchAccounts={people.search}
              accountsLoading={people.isLoading}
              accountsFailed={people.isFailed}
              onSuggestionTitleChange={setSuggestionTitle}
              onSuggestedAbstractChange={setAbstract}
              scope={scope}
              onScopeChange={setScope}
              onContinue={({ suggestedAbstract, ...values }) => {
                setDraft(values);
                setAbstract(suggestedAbstract);
                setSubmitError(undefined);
                setStep('details');
              }}
            />
          </div>
          {draft && (
            <div hidden={step !== 'details'}>
              <ArticleCreationDetails
                suggestedAbstract={abstract}
                topics={topics.items}
                suggestions={topicSuggestions.items}
                suggestionsLoading={topicSuggestions.loading}
                suggestionsUnavailable={topicSuggestions.unavailable}
                onAbstractChange={setEditedAbstract}
                onSearchTopics={topics.search}
                topicsLoading={topics.isLoading}
                topicsFailed={topics.isFailed}
                isSubmitting={isPending}
                submitError={submitError}
                onBack={() => setStep('basics')}
                onSubmit={(details) => void publish(details)}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
