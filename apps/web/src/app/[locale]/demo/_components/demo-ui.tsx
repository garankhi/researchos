'use client';

import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Layout primitives for the demo page.
 *
 * Kept separate from the demo sections so the section components stay
 * focused on what they demonstrate rather than on page chrome.
 */

export function DemoSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper component="section" id={id} sx={{ p: 3, scrollMarginTop: 24 }}>
      <Stack spacing={1}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        ) : null}
        <Divider sx={{ my: 1 }} />
        {children}
      </Stack>
    </Paper>
  );
}

export function DemoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        alignItems: 'center',
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 160, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      color="text.tertiary"
      sx={{ display: 'block' }}
    >
      {children}
    </Typography>
  );
}
