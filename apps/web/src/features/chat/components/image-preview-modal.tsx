'use client';

import {
  Button,
  Dialog,
  Flex,
  HStack,
  IconButton,
  Image,
  Link,
  Portal,
  Text,
} from '@chakra-ui/react';
import { Download, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface ImagePreviewTarget {
  url: string;
  fileName: string;
}

export function ImagePreviewModal({
  target,
  onClose,
}: {
  target: ImagePreviewTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations('chat');
  const tCommon = useTranslations('common');

  if (!target) return null;

  return (
    <Dialog.Root
      open={Boolean(target)}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="xl"
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.800" backdropFilter="blur(4px)" />
        <Dialog.Positioner p="4">
          <Dialog.Content
            boxShadow="overlayPanel"
            maxW="5xl"
            w="full"
            bg="bg.panel"
            overflow="hidden"
          >
            <Flex
              px="4"
              py="3"
              align="center"
              justify="space-between"
              borderBottomWidth="1px"
              borderColor="border.emphasized"
              gap="3"
            >
              <Text textStyle="sm" fontWeight="semibold" truncate flex="1">
                {target.fileName}
              </Text>

              <HStack gap="2" flexShrink={0}>
                <Link href={target.url} download={target.fileName} asChild>
                  <Button size="xs" variant="outline" type="button">
                    <Download size={14} />
                    {t('downloadFile')}
                  </Button>
                </Link>

                <Dialog.CloseTrigger asChild>
                  <IconButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={tCommon('close')}
                    onClick={onClose}
                  >
                    <X size={16} />
                  </IconButton>
                </Dialog.CloseTrigger>
              </HStack>
            </Flex>

            <Dialog.Body p="4" bg="bg.subtle">
              <Flex
                align="center"
                justify="center"
                minH="240px"
                maxH="75vh"
                overflow="hidden"
              >
                <Image
                  src={target.url}
                  alt={target.fileName}
                  maxH="75vh"
                  maxW="100%"
                  objectFit="contain"
                  borderRadius="md"
                />
              </Flex>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
