'use client';

import {
  IconButton,
  Input,
  InputGroup,
  Popover,
  Portal,
} from '@chakra-ui/react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, type Ref } from 'react';

function SearchInput({ inputRef }: { inputRef?: Ref<HTMLInputElement> }) {
  const t = useTranslations('search');

  return (
    <InputGroup startElement={<Search size={16} aria-hidden />} maxW="lg">
      <Input
        ref={inputRef}
        type="search"
        placeholder={t('placeholder')}
        aria-label={t('label')}
      />
    </InputGroup>
  );
}

export default function SearchBar({ mode }: { mode: 'inline' | 'popover' }) {
  const t = useTranslations('search');
  const input = useRef<HTMLInputElement>(null);

  if (mode === 'inline') return <SearchInput />;

  return (
    <Popover.Root
      initialFocusEl={() => input.current}
      positioning={{ placement: 'bottom-end' }}
    >
      <Popover.Trigger asChild>
        <IconButton variant="ghost" aria-label={t('open')} hideFrom="md">
          <Search />
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner hideFrom="md">
          <Popover.Content aria-label={t('label')} width="min(90vw, 26rem)">
            <Popover.Body>
              <SearchInput inputRef={input} />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
