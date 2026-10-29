'use client';

import { useState, useTransition } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import TranslateIcon from '@mui/icons-material/Translate';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_LABELS, routing, type Locale } from '@/i18n/routing';

/**
 * Language switcher.
 *
 * Switching locale keeps the user on the same page: the pathname is read
 * without the locale prefix and re-applied with the new one, so `/vi/demo`
 * becomes `/en/demo` rather than dropping the user on the home page.
 *
 * The switch happens through `router.replace` rather than `push` — a
 * language change is a preference, not a new step in the history, so the
 * back button should not walk through it.
 *
 * Each locale is labelled in its own language ("Tiếng Việt", "English"),
 * because a reader who does not read the current UI language still has to
 * recognise their own.
 */
export function LanguageToggle() {
  const t = useTranslations('language');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (target: Locale) => {
    setAnchorEl(null);

    if (target === locale) return;

    startTransition(() => {
      router.replace(pathname, { locale: target });
    });
  };

  return (
    <>
      <Tooltip title={t('label')}>
        <Button
          color="inherit"
          startIcon={<TranslateIcon />}
          disabled={isPending}
          aria-label={t('label')}
          aria-haspopup="menu"
          aria-controls="language-menu"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          sx={{ minWidth: 0 }}
        >
          {LOCALE_LABELS[locale]}
        </Button>
      </Tooltip>

      <Menu
        id="language-menu"
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        keepMounted
      >
        {routing.locales.map((option) => (
          <MenuItem
            key={option}
            selected={option === locale}
            onClick={() => handleSelect(option)}
          >
            <ListItemIcon>
              {option === locale ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText>{LOCALE_LABELS[option]}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export default LanguageToggle;
