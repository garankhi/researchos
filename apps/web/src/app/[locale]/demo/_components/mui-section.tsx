'use client';

import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * A broad sample of MUI components, so a regression in the theme, the
 * emotion cache or the v9 prop surface shows up immediately.
 */
export function MuiSection() {
  const t = useTranslations('demo');

  return (
    <DemoSection
      id="mui"
      title={t('sections.mui.title')}
      description={t('sections.mui.description')}
    >
      <Stack spacing={3}>
        <DemoRow label={t('labels.buttons')}>
          <Button variant="contained">{t('mui.contained')}</Button>
          <Button variant="outlined">{t('mui.outlined')}</Button>
          <Button variant="text">{t('mui.text')}</Button>
          <Button variant="contained" color="error">
            {t('mui.error')}
          </Button>
          <Button variant="outlined" disabled>
            {t('mui.disabled')}
          </Button>
        </DemoRow>

        <DemoRow label={t('labels.chips')}>
          <Chip label={t('mui.chipDefault')} />
          <Chip label={t('mui.chipSuccess')} color="success" />
          <Chip
            label={t('mui.chipWarning')}
            color="warning"
            variant="outlined"
          />
          <Chip label={t('mui.chipDeletable')} onDelete={() => undefined} />
        </DemoRow>

        <DemoRow label={t('labels.inputs')}>
          <TextField
            label={t('mui.inputText')}
            size="small"
            defaultValue="ResearchOS"
          />
          <TextField label={t('mui.inputDisabled')} size="small" disabled />
          <Switch defaultChecked />
        </DemoRow>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
            {t('labels.typography')}
          </Typography>
          <Typography variant="h1">{t('typography.heading1')}</Typography>
          <Typography variant="h5">{t('typography.heading5')}</Typography>
          <Typography variant="subtitle1">{t('typography.subtitle1')}</Typography>
          <Typography variant="body1">{t('typography.body1')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('typography.body2')}
          </Typography>
          <Typography variant="caption" color="text.tertiary">
            {t('typography.caption')}
          </Typography>
        </Box>

        <Divider />

        <Stack spacing={2}>
          <Alert severity="success">
            <AlertTitle>{t('alerts.successTitle')}</AlertTitle>
            {t('alerts.successBody')}
          </Alert>
          <Alert severity="warning">
            <AlertTitle>{t('alerts.warningTitle')}</AlertTitle>
            {t('alerts.warningBody')}
          </Alert>
          <Alert severity="info">{t('alerts.infoBody')}</Alert>
        </Stack>

        <DemoNote>{t('notes.muiSystemProps')}</DemoNote>
      </Stack>
    </DemoSection>
  );
}
