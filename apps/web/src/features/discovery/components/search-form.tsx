'use client';

import { Box, IconButton, Input, InputGroup } from '@chakra-ui/react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FieldError } from '@/components/ui/feedback';
import { searchTermError } from '../search-parameters';

export function SearchForm({
  initialTerm = '',
  onSearch,
}: {
  initialTerm?: string;
  onSearch: (term: string) => void;
}) {
  const t = useTranslations('search');
  const errorId = useId();
  const [draft, setDraft] = useState(initialTerm);
  const [submitted, setSubmitted] = useState(false);
  const term = draft.trim();
  const issue = searchTermError(term);
  const showError = issue && (issue !== 'minimum' || submitted);

  return (
    <Box
      as="form"
      role="search"
      w="full"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (!issue) onSearch(term);
      }}
    >
      <InputGroup
        endElement={
          <IconButton
            type="submit"
            aria-label={t('submit')}
            pointerEvents="auto"
            variant="ghost"
            size="xs"
          >
            <Search size={20} aria-hidden />
          </IconButton>
        }
      >
        <Input
          type="search"
          value={draft}
          placeholder={t('placeholder')}
          aria-label={t('label')}
          aria-invalid={Boolean(showError)}
          aria-describedby={showError ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setSubmitted(false);
          }}
        />
      </InputGroup>
      {showError && <FieldError id={errorId}>{t(issue)}</FieldError>}
    </Box>
  );
}
