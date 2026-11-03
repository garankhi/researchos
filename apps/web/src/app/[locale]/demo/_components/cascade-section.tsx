'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Proves the Tailwind -> MUI cascade works without `!important`.
 *
 * `globals.css` declares `@layer theme, base, mui, components, utilities;` and
 * `layout.tsx` mounts `AppRouterCacheProvider` with `enableCssLayer: true`.
 * That places MUI styles in the `mui` layer, below Tailwind's `utilities`
 * layer, so a Tailwind utility class beats the MUI component's own styles.
 *
 * The reference element uses Tailwind's own `--color-amber-500` variable, so
 * the check stays correct across Tailwind versions and color spaces. Comparing
 * computed style strings is not enough on its own: the browser may serialize
 * the same color differently depending on how it was authored, so the two
 * values are also compared as resolved pixels.
 */
export function CascadeSection() {
  const t = useTranslations('demo');
  const boxRef = useRef<HTMLDivElement>(null);
  const referenceRef = useRef<HTMLDivElement>(null);
  const [computed, setComputed] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    const toPixel = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return `${r},${g},${b},${a}`;
    };

    const read = () => {
      const element = boxRef.current;
      const ref = referenceRef.current;
      if (!element || !ref) return;

      const elementColor = window.getComputedStyle(element).backgroundColor;
      const referenceColor = window.getComputedStyle(ref).backgroundColor;

      setComputed(elementColor);
      setReference(referenceColor);
      setMatches(toPixel(elementColor) === toPixel(referenceColor));
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <DemoSection
      id="cascade"
      title={t('sections.cascade.title')}
      description={t('sections.cascade.description')}
    >
      <Stack spacing={2}>
        <Box
          ref={boxRef}
          className="bg-amber-500 text-black"
          sx={{
            backgroundColor: 'primary.main',
            borderRadius: 1,
            p: 3,
            color: 'primary.contrastText',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t('cascade.heading')}
          </Typography>
          <Typography variant="body2">{t('cascade.body')}</Typography>
        </Box>

        {/* Reference: Tailwind's own token, so the check tracks the version. */}
        <Box
          ref={referenceRef}
          aria-hidden
          sx={{
            backgroundColor: 'var(--color-amber-500)',
            width: 1,
            height: 1,
          }}
        />

        <DemoRow label={t('labels.computedBackground')}>
          <Chip
            label={computed || t('theme.htmlClassEmpty')}
            size="small"
            variant="outlined"
          />
          <Chip
            label={t('labels.reference', {
              value: reference || t('theme.htmlClassEmpty'),
            })}
            size="small"
            variant="outlined"
          />
          <Chip
            label={matches ? t('labels.tailwindWins') : t('labels.notMatching')}
            size="small"
            color={matches ? 'success' : 'warning'}
          />
        </DemoRow>

        <DemoNote>{t('notes.cascade')}</DemoNote>
      </Stack>
    </DemoSection>
  );
}
