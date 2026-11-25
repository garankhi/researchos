import {
  normalizeArticleDoi,
  parsePublicationDate,
} from '@researchos/publication-metadata';
import { z } from 'zod';
import type { CreateArticleAuthorDto } from '@/lib/api/models/createArticleAuthorDto';

export const articleBasicsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'title_required')
    .max(500, 'revision_title_too_long'),
  authors: z
    .array(
      z.object({
        displayName: z
          .string()
          .trim()
          .min(1, 'author_name_invalid')
          .max(255, 'author_name_invalid'),
        userId: z.string().optional(),
      }),
    )
    .min(1, 'article_authors_invalid'),
  publicationDate: z
    .string()
    .trim()
    .refine((value) => {
      const iso = value.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1');
      return Boolean(parsePublicationDate(iso));
    }, 'publication_date_invalid'),
  doi: z
    .string()
    .trim()
    .refine(
      (value) => !value || Boolean(normalizeArticleDoi(value)),
      'doi_invalid',
    ),
});

export type ArticleBasics = z.infer<typeof articleBasicsSchema>;
export type AuthorOption = Required<
  Pick<CreateArticleAuthorDto, 'displayName'>
> & { userId: string };
export const emptyBasics: ArticleBasics = {
  title: '',
  authors: [],
  publicationDate: '',
  doi: '',
};
