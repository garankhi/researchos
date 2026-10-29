'use client';
import * as React from 'react';
import { styled, alpha } from '@mui/material/styles';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslations } from 'next-intl';

const Search = styled('div')(({ theme }) => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    borderRadius: theme.shape.borderRadius,
    backgroundColor: alpha(theme.palette.common.white, 0.15),
    '&:hover': {
        backgroundColor: alpha(theme.palette.common.white, 0.25),
    },
    width: '100%',
    minWidth: 0,
}));

const SearchIconWrapper = styled('div')(({ theme }) => ({
    padding: theme.spacing(0, 2),
    height: '100%',
    position: 'absolute',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
    color: 'inherit',
    width: '100%',
    '& .MuiInputBase-input': {
        padding: theme.spacing(1, 1, 1, 0),
        // vertical padding + font size from searchIcon
        paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    },
}));

export default function SearchAppBar() {
    const t = useTranslations('search');
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const open = Boolean(anchorEl);

    const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    // Focus the input once the popover has rendered
    React.useEffect(() => {
        if (open) {
            const raf = requestAnimationFrame(() => inputRef.current?.focus());
            return () => cancelAnimationFrame(raf);
        }
    }, [open]);

    return (
        <>
            {/* Collapsed trigger — mirrors the header's hamburger pattern */}
            <IconButton
                aria-label={t('open')}
                aria-controls="search-menu"
                aria-haspopup="true"
                onClick={handleOpen}
                color="inherit"
                sx={{ display: { xs: 'inline-flex', md: 'none' } }}
            >
                <SearchIcon />
            </IconButton>

            {/* Popover — same Menu behaviour as the collapsed nav menu */}
            <Menu
                id="search-menu"
                anchorEl={anchorEl}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                keepMounted
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                open={open}
                onClose={handleClose}
                disableAutoFocusItem
                sx={{
                    display: { xs: 'block', md: 'none' },
                    mt: 1,
                    p: 1,
                    width: 'min(92vw, 420px)',
                }}
            >
                <Search>
                    <SearchIconWrapper>
                        <SearchIcon />
                    </SearchIconWrapper>
                    <StyledInputBase
                        inputRef={inputRef}
                        placeholder={t('placeholder')}
                        inputProps={{ 'aria-label': t('label') }}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Escape') handleClose();
                        }}
                    />
                </Search>
            </Menu>

            {/* Expanded inline field — md and up, centered in the toolbar */}
            <Search
                sx={{
                    display: { xs: 'none', md: 'flex' },
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: { md: 380, lg: 480 },
                }}
            >
                <SearchIconWrapper>
                    <SearchIcon />
                </SearchIconWrapper>
                <StyledInputBase
                    placeholder={t('placeholder')}
                    inputProps={{ 'aria-label': t('label') }}
                />
            </Search>
        </>
    );
}
