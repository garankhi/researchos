import { useId, useState } from 'react';
import {
  Button,
  Box,
  Field,
  Flex,
  IconButton,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useController, useFormContext } from 'react-hook-form';
import type { ArticleBasics, AuthorOption } from './article-basics';

export function ArticleAuthorsField({
  options,
  onEdit,
  onSearch,
  isLoading,
  isFailed,
}: {
  options: AuthorOption[];
  onEdit: () => void;
  onSearch?: (query: string) => void;
  isLoading?: boolean;
  isFailed?: boolean;
}) {
  const t = useTranslations('articleBasics');
  const errors = useTranslations('errors.codes.fields');
  const { control } = useFormContext<ArticleBasics>();
  const { field, fieldState } = useController({ name: 'authors', control });
  const [query, setQuery] = useState('');
  const id = useId();
  const name = query.trim();
  const matches = name
    ? options.filter(
        (a) =>
          (onSearch ||
            a.displayName
              .toLocaleLowerCase()
              .includes(name.toLocaleLowerCase())) &&
          !field.value.some((row) => row.userId === a.userId),
      )
    : [];
  function change(rows: ArticleBasics['authors']) {
    onEdit();
    field.onChange(rows);
  }
  function add(author: ArticleBasics['authors'][number]) {
    change([...field.value, author]);
    setQuery('');
    onSearch?.('');
  }
  function move(index: number, offset: number) {
    const rows = [...field.value];
    const target = index + offset;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    change(rows);
  }
  return (
    <Field.Root invalid={fieldState.invalid}>
      <Field.Label htmlFor={id}>{t('authors')}</Field.Label>
      <Stack w="full" bg="bg.subtle" p="3" gap="2">
        {field.value.map((author, index) => (
          <Flex key={index} align="center" gap="2" bg="bg.panel" px="2" py="1">
            <Box flexShrink="0">
              <Image
                src="/default-avatar.webp"
                alt=""
                width={28}
                height={28}
                unoptimized
              />
            </Box>
            <Text flex="1" minW="0" overflowWrap="anywhere">
              {author.displayName}
            </Text>
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              disabled={!index}
              aria-label={t('up', { name: author.displayName })}
              onClick={() => move(index, -1)}
            >
              <ArrowUp />
            </IconButton>
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              disabled={index === field.value.length - 1}
              aria-label={t('down', { name: author.displayName })}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </IconButton>
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              aria-label={t('removeAuthor', { name: author.displayName })}
              onClick={() => change(field.value.filter((_, i) => i !== index))}
            >
              <X />
            </IconButton>
          </Flex>
        ))}
        <Flex gap="2" wrap="wrap">
          <Input
            id={id}
            ref={(element) => field.ref(element)}
            onBlur={field.onBlur}
            variant="subtle"
            flex="1"
            minW="32"
            maxLength={255}
            placeholder={t('authorPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearch?.(e.target.value);
              onEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (name) add({ displayName: name });
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!name}
            onClick={() => add({ displayName: name })}
          >
            {t('addName')}
          </Button>
        </Flex>
        {isLoading && (
          <Text role="status" textStyle="sm" color="fg.muted">
            {t('searchingAccounts')}
          </Text>
        )}
        {isFailed && (
          <Text role="status" textStyle="sm" color="fg.muted">
            {t('accountSearchFailed')}
          </Text>
        )}
        {matches.map((account) => (
          <Button
            key={account.userId}
            type="button"
            variant="ghost"
            justifyContent="start"
            onClick={() => add(account)}
          >
            {t('selectAccount', { name: account.displayName })}
          </Button>
        ))}
      </Stack>
      {fieldState.invalid && (
        <Field.ErrorText>{errors('article_authors_invalid')}</Field.ErrorText>
      )}
    </Field.Root>
  );
}
