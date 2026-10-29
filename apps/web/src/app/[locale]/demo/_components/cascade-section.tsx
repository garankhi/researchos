'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
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
      title="Tailwind x MUI cascade"
      description="Utility class của Tailwind phải thắng style mặc định của MUI, không cần !important."
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
            Tailwind bg-amber-500 vs MUI backgroundColor
          </Typography>
          <Typography variant="body2">
            MUI đặt backgroundColor là primary.main; Tailwind đặt bg-amber-500.
          </Typography>
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

        <DemoRow label="Computed background">
          <Chip
            label={computed || '(đang đọc…)'}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`Tham chiếu: ${reference || '(đang đọc…)'}`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={matches ? 'Tailwind thắng' : 'Chưa khớp'}
            size="small"
            color={matches ? 'success' : 'warning'}
          />
        </DemoRow>

        <DemoNote>
          Nếu kết quả là “Chưa khớp”, layer `mui` đang nằm trên `utilities` —
          kiểm tra lại `@layer` trong globals.css và `enableCssLayer` trong
          layout.tsx.
        </DemoNote>
      </Stack>
    </DemoSection>
  );
}
