'use client';

import { Box, chakra, IconButton, Input, InputGroup } from '@chakra-ui/react';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { FieldError } from '@/components/ui/feedback';
import {
  defaultSearchTab,
  searchTabs,
  searchTermError,
  type SearchTab,
} from '../search-parameters';

export function SearchForm({
  initialTerm = '',
  onSearch,
  onClear,
}: {
  initialTerm?: string;
  onSearch: (term: string, tab: SearchTab) => void;
  onClear?: () => void;
}) {
  const t = useTranslations('search');
  const errorId = useId();
  const scopeLabelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previousInitialTerm, setPreviousInitialTerm] = useState(initialTerm);
  const [draft, setDraft] = useState(initialTerm);
  const [submitted, setSubmitted] = useState(false);
  const [open, setOpen] = useState(false);
  if (initialTerm !== previousInitialTerm) {
    setPreviousInitialTerm(initialTerm);
    setDraft(initialTerm);
    setSubmitted(false);
    setOpen(false);
  }
  const term = draft.trim();
  const issue = searchTermError(term);
  const showError = issue && (issue !== 'minimum' || submitted);
  const showScopes = open && !issue;
  const submitButton = (
    <IconButton
      type="submit"
      aria-label={t('submit')}
      pointerEvents="auto"
      variant="ghost"
      size={onClear ? 'sm' : 'xs'}
    >
      <Search size={20} aria-hidden />
    </IconButton>
  );

  return (
    <Box
      as="form"
      role="search"
      aria-label={onClear ? t('pageSearch') : undefined}
      position="relative"
      w="full"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !showScopes) return;
        event.preventDefault();
        event.stopPropagation();
        inputRef.current?.focus();
        setOpen(false);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (issue) return;
        setOpen(false);
        onSearch(term, defaultSearchTab);
      }}
    >
      <InputGroup
        startElement={onClear ? submitButton : undefined}
        endElement={
          onClear
            ? draft && (
                <IconButton
                  type="button"
                  aria-label={t('clear')}
                  pointerEvents="auto"
                  variant="ghost"
                  size="sm"
                  color="fg.muted"
                  onClick={() => {
                    setDraft('');
                    setSubmitted(false);
                    setOpen(false);
                    inputRef.current?.focus();
                    onClear();
                  }}
                >
                  <X size={20} aria-hidden />
                </IconButton>
              )
            : submitButton
        }
      >
        <Input
          ref={inputRef}
          type="search"
          value={draft}
          size={onClear ? 'xl' : 'md'}
          variant={onClear ? 'flushed' : 'outline'}
          bg={onClear ? 'bg.muted' : undefined}
          borderColor={onClear ? 'border.emphasized' : undefined}
          fontSize={onClear ? 'md' : undefined}
          css={
            onClear
              ? { '&::-webkit-search-cancel-button': { display: 'none' } }
              : undefined
          }
          placeholder={t('placeholder')}
          aria-label={t('label')}
          aria-invalid={Boolean(showError)}
          aria-describedby={showError ? errorId : undefined}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setDraft(event.target.value);
            setSubmitted(false);
            setOpen(true);
          }}
        />
      </InputGroup>
      {showScopes && (
        <Box
          role="group"
          aria-labelledby={scopeLabelId}
          position="absolute"
          insetInline="0"
          top="full"
          zIndex="dropdown"
          maxH="min(20rem, 50dvh)"
          overflowY="auto"
          bg="bg.panel"
          borderWidth="1px"
          boxShadow="overlayPanel"
        >
          <Box
            id={scopeLabelId}
            px="4"
            py="3"
            borderBottomWidth="1px"
            fontSize="sm"
            fontWeight="medium"
          >
            {t('searchFor')}
          </Box>
          {searchTabs.map((tab) => (
            <chakra.button
              type="button"
              key={tab}
              display="flex"
              alignItems="center"
              w="full"
              gap="2"
              px="4"
              py="3"
              textAlign="start"
              cursor="pointer"
              borderBottomWidth="1px"
              _last={{ borderBottomWidth: '0' }}
              layerStyle="interactiveRow"
              onClick={() => {
                inputRef.current?.focus();
                setOpen(false);
                onSearch(term, tab);
              }}
            >
              <Search size={18} aria-hidden style={{ flexShrink: 0 }} />
              <Box as="span" overflowWrap="anywhere">
                {t.rich('searchIn', {
                  term,
                  category: t(`tabs.${tab}`),
                  query: (chunks) => <strong>{chunks}</strong>,
                })}
              </Box>
            </chakra.button>
          ))}
        </Box>
      )}
      {showError && <FieldError id={errorId}>{t(issue)}</FieldError>}
    </Box>
  );
}
