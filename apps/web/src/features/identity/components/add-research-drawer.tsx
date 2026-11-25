'use client';

import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Box,
  Button,
  Drawer,
  HStack,
  Icon,
  IconButton,
  Portal,
  Stack,
  Text,
  VisuallyHidden,
} from '@chakra-ui/react';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  CirclePlus,
  ClipboardList,
  File,
  Image,
  Presentation,
  Table2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

const researchTypes = [
  { key: 'published', icon: File, hasMore: true },
  { key: 'preprint', icon: ClipboardList, hasMore: false },
  { key: 'conference', icon: File, hasMore: false },
  { key: 'presentation', icon: Presentation, hasMore: false },
  { key: 'poster', icon: Image, hasMore: false },
  { key: 'data', icon: Table2, hasMore: false },
  { key: 'other', icon: CirclePlus, hasMore: true },
] as const;

export function AddResearchDrawer({
  inHeader = false,
  open,
  onOpenChange,
  finalFocusEl,
  onSelectArticle,
}: {
  inHeader?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  finalFocusEl?: ComponentProps<typeof Drawer.Root>['finalFocusEl'];
  onSelectArticle?: () => void;
}) {
  const t = useTranslations('addResearch');
  const common = useTranslations('common');
  const article = useTranslations('articleBasics');
  const [publishedOpen, setPublishedOpen] = useState(false);
  const publishedButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const returningToCategories = useRef(false);

  useLayoutEffect(() => {
    if (publishedOpen) {
      backButton.current?.focus();
    } else if (returningToCategories.current) {
      returningToCategories.current = false;
      publishedButton.current?.focus();
    }
  }, [publishedOpen]);

  return (
    <Drawer.Root
      placement="end"
      open={open}
      onOpenChange={({ open }) => {
        if (!open) setPublishedOpen(false);
        onOpenChange?.(open);
      }}
      finalFocusEl={finalFocusEl}
    >
      <Drawer.Trigger asChild>
        <Button
          size="xs"
          borderRadius="9999px"
          fontFamily="sans"
          fontSize="sm"
          fontWeight="normal"
          px="3.5"
          ms={inHeader ? '2' : undefined}
          hideBelow={inHeader ? 'lg' : undefined}
        >
          {t('trigger')}
        </Button>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Backdrop bg="drawerBackdrop" />
        <Drawer.Positioner>
          <Drawer.Content
            maxW="min(100vw, 20rem)"
            fontFamily="sans"
            boxShadow="overlayPanel"
          >
            <Drawer.Header
              alignItems="center"
              borderBottomWidth="1px"
              ps="6"
              pe="3"
              py="6"
            >
              {publishedOpen ? (
                <>
                  <VisuallyHidden asChild>
                    <Drawer.Title>{t('published.label')}</Drawer.Title>
                  </VisuallyHidden>
                  <HStack gap="2">
                    <Icon as={ChevronLeft} boxSize="4" aria-hidden />
                    <Button
                      ref={backButton}
                      type="button"
                      variant="plain"
                      size="sm"
                      minW="0"
                      px="0"
                      color="fg"
                      fontWeight="normal"
                      _hover={{
                        textDecoration: 'underline',
                        textUnderlineOffset: '3px',
                      }}
                      onClick={() => {
                        returningToCategories.current = true;
                        setPublishedOpen(false);
                      }}
                    >
                      {t('goBack')}
                    </Button>
                  </HStack>
                </>
              ) : (
                <Drawer.Title fontFamily="heading" textStyle="2xl">
                  {t('title')}
                </Drawer.Title>
              )}
              <Drawer.CloseTrigger asChild>
                <IconButton
                  position="static"
                  type="button"
                  variant="plain"
                  size="sm"
                  ms="auto"
                  w="11"
                  flexShrink="0"
                  borderRadius="9999px"
                  color="fg"
                  _hover={{ bg: 'bg.inverted', color: 'fg.inverted' }}
                  aria-label={common('close')}
                >
                  <X aria-hidden />
                </IconButton>
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body p="0">
              {publishedOpen ? (
                <Stack as="ul" gap="0" listStyleType="none" py="2">
                  <Box as="li">
                    <Drawer.CloseTrigger asChild>
                      <Button
                        position="static"
                        type="button"
                        variant="ghost"
                        layerStyle="interactiveRow"
                        w="full"
                        minH="12"
                        px="6"
                        justifyContent="start"
                        textStyle="md"
                        fontWeight="normal"
                        onClick={onSelectArticle}
                      >
                        {article('article')}
                      </Button>
                    </Drawer.CloseTrigger>
                  </Box>
                </Stack>
              ) : (
                <Stack gap="0" borderBottomWidth="1px">
                  {researchTypes.map(({ key, icon: TypeIcon, hasMore }) => (
                    <Button
                      key={key}
                      ref={key === 'published' ? publishedButton : undefined}
                      onClick={
                        key === 'published' && onSelectArticle
                          ? () => setPublishedOpen(true)
                          : undefined
                      }
                      type="button"
                      variant="ghost"
                      layerStyle="interactiveRow"
                      justifyContent="start"
                      textAlign="start"
                      whiteSpace="normal"
                      gap="4"
                      minH="20"
                      h="auto"
                      px="6"
                      py="4"
                      borderBottomWidth={
                        key === 'published' ? '1px' : undefined
                      }
                    >
                      <Box
                        position="relative"
                        display="inline-grid"
                        placeItems="center"
                        boxSize="9"
                        flexShrink="0"
                      >
                        <Icon
                          as={Circle}
                          position="absolute"
                          boxSize="9"
                          strokeWidth={1}
                          aria-hidden
                        />
                        <Icon as={TypeIcon} boxSize="4" aria-hidden />
                      </Box>
                      <Stack as="span" gap="1" align="start">
                        <Text
                          as="span"
                          display="inline-flex"
                          alignItems="center"
                          gap="2"
                          textStyle="md"
                        >
                          {t(`${key}.label`)}
                          {hasMore && (
                            <Icon as={ChevronRight} boxSize="4" aria-hidden />
                          )}
                        </Text>
                        <Text as="span" textStyle="sm" color="fg.muted">
                          {t(`${key}.description`)}
                        </Text>
                      </Stack>
                    </Button>
                  ))}
                </Stack>
              )}
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
