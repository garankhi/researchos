'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import Header from '@/components/ui/header';
import { SearchBar } from '@/features/discovery';
import { AddResearchDrawer } from '@/features/identity';
import { useRouter } from '@/i18n/navigation';

export function AppHeader({ accountSlot }: { accountSlot?: ReactNode }) {
  const t = useTranslations('addResearch');
  const router = useRouter();
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
        onSelectArticle={() => router.push('/outputs/new/article')}
        finalFocusEl={() =>
          moreTrigger.current?.offsetWidth ? moreTrigger.current : null
        }
      />
    </Header>
  );
}
