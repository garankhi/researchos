'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { useState, type ReactNode } from 'react';

export function EmotionRegistry({ children }: { children: ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: 'chakra' });
    cache.compat = true;
    const insert = cache.insert;
    let pending: { name: string; global: boolean }[] = [];

    // Streamed Suspense chunks use the same style cache as the shell.
    if (typeof window === 'undefined') {
      cache.insert = (selector, serialized, sheet, shouldCache) => {
        if (cache.inserted[serialized.name] === undefined) {
          pending.push({ name: serialized.name, global: !selector });
        }
        return insert(selector, serialized, sheet, shouldCache);
      };
    }

    return {
      cache,
      flush() {
        const styles = pending;
        pending = [];
        return styles;
      },
    };
  });

  useServerInsertedHTML(() => {
    const styles = flush();
    const local = styles.filter(({ global }) => !global);

    return (
      <>
        {styles
          .filter(({ global }) => global)
          .map(({ name }) => (
            <style
              key={name}
              data-emotion={`${cache.key}-global ${name}`}
              dangerouslySetInnerHTML={{ __html: String(cache.inserted[name]) }}
            />
          ))}
        {local.length > 0 && (
          <style
            data-emotion={`${cache.key} ${local.map(({ name }) => name).join(' ')}`}
            dangerouslySetInnerHTML={{
              __html: local.map(({ name }) => cache.inserted[name]).join(''),
            }}
          />
        )}
      </>
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
