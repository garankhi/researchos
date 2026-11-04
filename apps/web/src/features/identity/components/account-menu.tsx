'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Avatar,
  Box,
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import AccountCircle from '@mui/icons-material/AccountCircle';
import Logout from '@mui/icons-material/Logout';
import { useRouter } from '@/i18n/navigation';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { useSession } from '../hooks/use-session';
import { useLogout } from '../hooks/use-logout';
import { initialsOf } from '../utils/initials';

/**
 * The account menu in the header.
 *
 * It shows who is signed in and offers the way out. The avatar carries
 * the initials of the display name, because the backend has no avatar
 * field — a name and the initials are enough to tell two accounts apart
 * without a second request or an upload.
 *
 * ## Why the menu lives in the feature
 *
 * The header is a shared primitive and knows nothing about a domain. The
 * session is the identity domain, so the account menu lives here, in the
 * feature, and the header renders it through a slot.
 */
export function AccountMenu() {
  const t = useTranslations('nav');
  const tIdentity = useTranslations('identity');
  const { showSnackbar } = useSnackbar();
  const router = useRouter();

  const { user } = useSession();
  const logout = useLogout();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuId = useId();

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();

    // `mutateAsync` is used instead of `mutate` on purpose.
    //
    // A per-call `onSuccess` passed to `mutate()` is only run when the
    // mutation observer still has listeners. Clearing the session store
    // unmounts this component, which unsubscribes the observer — so the
    // callback would never fire and the redirect would never happen.
    //
    // Awaiting the mutation instead keeps the navigation tied to the
    // request, not to the lifetime of the component.
    logout
      .mutateAsync(undefined)
      .then(() => {
        showSnackbar({
          severity: 'success',
          message: tIdentity('signedOutToast'),
        });

        // The account is gone, so the pages that need one are not worth
        // keeping open. The home page is the safe landing spot.
        router.replace('/');
      })
      .catch(() => {
        // The session could not be revoked. The client state is cleared
        // anyway — the `onSettled` of the hook does that — because a
        // half-signed-out state is worse than a signed-out one.
        showSnackbar({
          severity: 'error',
          message: tIdentity('signOutFailed'),
        });
      });
  };

  if (!user) {
    return null;
  }

  const initials = initialsOf(user.fullName);

  return (
    <>
      <Button
        onClick={handleOpen}
        aria-label={t('accountOfCurrentUser')}
        aria-haspopup="menu"
        aria-controls={menuId}
        sx={{
          color: 'inherit',
          minWidth: 0,
          px: 1,
          gap: 1,
        }}
      >
        <Avatar
          alt={user.fullName}
          sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}
        >
          {initials || <AccountCircle />}
        </Avatar>

        {/* The name is the point of the slot — the avatar alone says only
            that *somebody* is signed in. It is hidden on the narrow
            layout, where the avatar carries the identity on its own. */}
        <Typography
          variant="body2"
          noWrap
          sx={{
            display: { xs: 'none', md: 'block' },
            maxWidth: 160,
          }}
        >
          {user.fullName}
        </Typography>
      </Button>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1, maxWidth: 260 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
            {user.fullName}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {user.email}
          </Typography>
        </Box>

        <Divider />

        <MenuItem onClick={handleClose} disabled>
          <ListItemIcon>
            <AccountCircle fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={user.email} />
        </MenuItem>

        <MenuItem onClick={handleLogout} disabled={logout.isPending}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('logout')} />
        </MenuItem>
      </Menu>
    </>
  );
}
