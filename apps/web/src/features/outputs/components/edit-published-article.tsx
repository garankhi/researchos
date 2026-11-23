import { normalizeArticleDoi } from '@researchos/publication-metadata';
import type { UpdateArticleDto } from '@/lib/api/models/updateArticleDto';
import { useArticleCatalogs } from '../hooks/use-article-catalogs';
import { useUpdateArticle } from '../hooks/use-update-article';
import type { OutputDetail } from '../types';
import {
  ArticleEditDialog,
  type ArticleEditValues,
} from './article-edit-dialog';

function editableMetadata(
  values: ArticleEditValues,
): Omit<UpdateArticleDto, 'expectedRevisionId'> {
  return {
    title: values.title.trim(),
    authors: values.authors.map(({ authorId, displayName, userId }) => ({
      authorId,
      displayName: displayName.trim(),
      userId,
    })),
    abstract: values.abstract.trim() || null,
    publicationDate: values.publicationDate,
    journal: values.journal.trim() || null,
    volume: values.volume.trim() || null,
    issue: values.issue.trim() || null,
    pages: values.pages.trim() || null,
    doi: normalizeArticleDoi(values.doi) ?? (values.doi || null),
    peerReviewed:
      values.peerReviewed === 'unspecified'
        ? null
        : values.peerReviewed === 'yes',
    topicIds: [...values.topicIds].sort(),
  };
}

export function EditPublishedArticle({
  output,
  userId,
  onClose,
}: {
  output: OutputDetail & { revision: NonNullable<OutputDetail['revision']> };
  userId: string;
  onClose: () => void;
}) {
  const catalogs = useArticleCatalogs(true, true, userId);
  const mutation = useUpdateArticle();
  const { revision } = output;
  const article: ArticleEditValues = {
    title: revision.title,
    authors: output.authors.map((author) => ({
      authorId: author.id,
      displayName: author.authorNameString,
      userId: author.userId ?? undefined,
    })),
    abstract: revision.abstract ?? '',
    publicationDate:
      revision.publicationDate ?? revision.publicationYear?.toString() ?? '',
    journal: revision.venue ?? '',
    volume: revision.volume ?? '',
    issue: revision.issue ?? '',
    pages: revision.pages ?? '',
    doi: output.doi ?? '',
    peerReviewed:
      revision.peerReviewed == null
        ? 'unspecified'
        : revision.peerReviewed
          ? 'yes'
          : 'no',
    topicIds: output.topics.map((topic) => topic.topicId),
  };

  return (
    <ArticleEditDialog
      open
      article={article}
      accounts={catalogs.people.items}
      topics={catalogs.topics.items}
      savedTopics={output.topics.map((topic) => ({
        id: topic.topicId,
        name: topic.topicName,
      }))}
      catalogs={catalogs}
      isSubmitting={mutation.isPending}
      onClose={onClose}
      onSave={async (values) => {
        const before = editableMetadata(article);
        const after = editableMetadata(values);
        const data: UpdateArticleDto = { expectedRevisionId: revision.id };
        for (const key of Object.keys(after) as (keyof typeof after)[]) {
          if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) {
            Object.assign(data, { [key]: after[key] });
          }
        }
        if (Object.keys(data).length > 1)
          await mutation.mutateAsync({ outputId: output.id, data });
        onClose();
      }}
    />
  );
}
