'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import Header from '@/components/ui/header';
import { SearchBar } from '@/features/discovery';
import { AddResearchDrawer } from '@/features/identity';

export function AppHeader({ accountSlot }: { accountSlot?: ReactNode }) {
  const t = useTranslations('addResearch');
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const [addResearchOpen, setAddResearchOpen] = useState(false);

  return (
    <Header
      desktopSearch={<SearchBar mode="inline" />}
      mobileSearch={<SearchBar mode="popover" />}
      moreAction={{
        label: t('trigger'),
        onSelect: () => setAddResearchOpen(true),
      }}
      moreTriggerRef={moreTrigger}
    >
      {accountSlot}
      <AddResearchDrawer
        inHeader
        open={addResearchOpen}
        onOpenChange={setAddResearchOpen}
        finalFocusEl={() =>
          moreTrigger.current?.offsetWidth ? moreTrigger.current : null
        }
      />
    </Header>
  );
}
