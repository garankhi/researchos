'use client';

import { IconButton, Popover, Portal } from '@chakra-ui/react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { readSearchTab, SearchForm, searchHref } from '@/features/discovery';
import { usePathname, useRouter } from '@/i18n/navigation';

export default function SearchBar({ mode }: { mode: 'inline' | 'popover' }) {
  const t = useTranslations('search');
  const label = t('label');
  const router = useRouter();
  const params = useSearchParams();
  const onSearchPage = usePathname() === '/search';
  const term = onSearchPage ? (params.get('q') ?? '') : '';
  const tab = readSearchTab(onSearchPage ? params.get('tab') : null);
  const [open, setOpen] = useState(false);

  const form = (
    <SearchForm
      key={term}
      initialTerm={term}
      onSearch={(nextTerm) => {
        setOpen(false);
        router.push(searchHref(nextTerm, tab));
      }}
    />
  );

  if (mode === 'inline') return form;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(event) => setOpen(event.open)}
      positioning={{ placement: 'bottom-end' }}
    >
      <Popover.Trigger asChild>
        <IconButton
          variant="ghost"
          data-header-icon=""
          aria-label={t('open')}
          hideFrom="lg"
        >
          <Search />
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner hideFrom="lg">
          <Popover.Content aria-label={label} width="min(90vw, 26rem)">
            <Popover.Body>{form}</Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
