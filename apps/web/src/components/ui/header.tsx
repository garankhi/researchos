'use client';
import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuIcon from '@mui/icons-material/Menu';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import SearchBar from '@/components/ui/search-bar';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { useTranslations } from 'next-intl';

/**
 * The navigation items, keyed by message id.
 *
 * The key is the message id, not the label — the label itself comes from
 * the message catalog, so it changes with the locale.
 */
const pageKeys = ['products', 'pricing', 'blog'] as const;

/**
 * The application header.
 *
 * It is a shared primitive, so it knows nothing about a domain. The
 * account area — the avatar, the account menu and the sign-out — belongs
 * to the identity feature, so the header receives it as `accountSlot`
 * rather than importing it.
 *
 * The direction of the dependency is the point: the feature knows about
 * the header's slot, not the other way round. A shared primitive that
 * imported a feature would be the lowest layer depending on the highest.
 */
function ResponsiveAppBar({ accountSlot }: { accountSlot?: React.ReactNode }) {
  const t = useTranslations('nav');
  const [anchorElNav, setAnchorElNav] = React.useState<null | HTMLElement>(
    null,
  );

  const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElNav(event.currentTarget);
  };

  const handleCloseNavMenu = () => {
    setAnchorElNav(null);
  };

  return (
    <AppBar position="static">
      <Container maxWidth={false}>
        <Toolbar disableGutters sx={{ position: 'relative' }}>
          <Typography
            variant="h6"
            noWrap
            component="a"
            href="/"
            sx={{
              mr: 2,
              display: { xs: 'none', md: 'flex' },
              fontWeight: 700,
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            ResearchOS
          </Typography>

          <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }}>
            <IconButton
              size="large"
              aria-label={t('openMenu')}
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleOpenNavMenu}
              color="inherit"
            >
              <MenuIcon />
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={anchorElNav}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
              }}
              keepMounted
              transformOrigin={{
                vertical: 'top',
                horizontal: 'left',
              }}
              open={Boolean(anchorElNav)}
              onClose={handleCloseNavMenu}
              sx={{ display: { xs: 'block', md: 'none' } }}
            >
              {pageKeys.map((page) => (
                <MenuItem key={page} onClick={handleCloseNavMenu}>
                  <Typography sx={{ textAlign: 'center' }}>
                    {t(page)}
                  </Typography>
                </MenuItem>
              ))}
            </Menu>
          </Box>
          <Typography
            variant="h5"
            noWrap
            component="a"
            href="/"
            sx={{
              mr: 2,
              display: { xs: 'flex', md: 'none' },
              flexGrow: 1,
              fontWeight: 700,
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            ResearchOS
          </Typography>
          <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' } }}>
            {pageKeys.map((page) => (
              <Button
                key={page}
                onClick={handleCloseNavMenu}
                sx={{ my: 2, color: 'inherit', display: 'block' }}
              >
                {t(page)}
              </Button>
            ))}
          </Box>
          <Box
            sx={{ flexGrow: 0, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <SearchBar />
            <LanguageToggle />
            <ThemeToggle />
            {accountSlot}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
export default ResponsiveAppBar;
