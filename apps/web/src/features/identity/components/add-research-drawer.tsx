'use client';

import type { ComponentProps } from 'react';
import {
  Box,
  Button,
  Drawer,
  Icon,
  IconButton,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
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
}: {
  inHeader?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  finalFocusEl?: ComponentProps<typeof Drawer.Root>['finalFocusEl'];
}) {
  const t = useTranslations('addResearch');
  const common = useTranslations('common');

  return (
    <Drawer.Root
      placement="end"
      open={open}
      onOpenChange={({ open }) => onOpenChange?.(open)}
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
            <Drawer.Header borderBottomWidth="1px" p="6">
              <Drawer.Title fontFamily="heading" textStyle="2xl">
                {t('title')}
              </Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <IconButton
                  position="static"
                  variant="ghost"
                  size="sm"
                  aria-label={common('close')}
                >
                  <X />
                </IconButton>
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body p="0">
              <Stack gap="0" borderBottomWidth="1px">
                {researchTypes.map(({ key, icon: TypeIcon, hasMore }) => (
                  <Button
                    key={key}
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
                    borderBottomWidth={key === 'published' ? '1px' : undefined}
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
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
