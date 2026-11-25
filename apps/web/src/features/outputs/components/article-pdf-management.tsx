import { useState, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Menu,
  Portal,
  RadioGroup,
  Stack,
  Tabs,
  Text,
  chakra,
} from '@chakra-ui/react';
import { ChevronDown, CirclePlus, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import type { CreateArticleDtoFileVisibility } from '@/lib/api/models/createArticleDtoFileVisibility';
import { ArticleIllustration } from './article-illustration';
import { ArticlePdfFileCard } from './article-pdf-file-card';

type PdfVisibility = CreateArticleDtoFileVisibility;
export type ManageableArticlePdf = {
  id: string;
  name: string;
  size: number;
  visibility: PdfVisibility | 'RESEARCH_GROUP';
};
const visibilities = ['FPTU_COMMUNITY', 'PRIVATE'] as const;

export function ArticlePdfManagement({
  file,
  onPickFile,
  onChangeVisibility,
  onRemove,
  downloadAction,
}: {
  file?: ManageableArticlePdf;
  onPickFile: (visibility: PdfVisibility) => void;
  onChangeVisibility: (
    fileId: string,
    visibility: PdfVisibility,
  ) => void | Promise<void>;
  onRemove: (fileId: string) => void | Promise<void>;
  downloadAction?: ReactNode;
}) {
  const t = useTranslations('articleEdit');
  const basics = useTranslations('articleBasics');
  const errors = useTranslations('errors');
  const fileTab = file?.visibility === 'PRIVATE' ? 'PRIVATE' : 'FPTU_COMMUNITY';
  const [tab, setTab] = useState<PdfVisibility>(fileTab);
  const [target, setTarget] = useState<ManageableArticlePdf>();
  const [action, setAction] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [failure, setFailure] = useState<string>();
  const nextVisibility =
    target?.visibility === 'PRIVATE' ? 'FPTU_COMMUNITY' : 'PRIVATE';
  const changeLabel = t(
    nextVisibility === 'PRIVATE' ? 'makePrivate' : 'makePublic',
  );

  async function confirm() {
    if (!target || isWorking || !action) return;
    setIsWorking(true);
    setFailure(undefined);
    try {
      if (action === 'remove') await onRemove(target.id);
      else {
        await onChangeVisibility(target.id, nextVisibility);
        setTab(nextVisibility);
      }
      setTarget(undefined);
    } catch (error) {
      setFailure(
        resolveErrorCode(errors, apiErrorCode(error), t('fileActionFailed')),
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Box bg="bg.panel" borderWidth="1px" minW="0">
      <Tabs.Root
        value={tab}
        onValueChange={({ value }) => {
          if (value === 'PRIVATE' || value === 'FPTU_COMMUNITY') setTab(value);
        }}
        colorPalette="blue"
        size="sm"
        fitted
      >
        <Tabs.List
          aria-label={t('fullText')}
          px={{ base: '2', sm: '4' }}
          alignItems="stretch"
        >
          {visibilities.map((visibility) => {
            const Icon = visibility === 'PRIVATE' ? EyeOff : Eye;
            return (
              <Tabs.Trigger
                key={visibility}
                value={visibility}
                flex="1 1 0"
                minW="0"
                h="auto"
                minH="9"
                px={{ base: '1.5', md: '3' }}
                py="2"
                gap={{ base: '1', md: '2' }}
                textStyle={{ base: 'xs', md: 'sm' }}
                whiteSpace="normal"
              >
                <Box as="span" flexShrink="0">
                  <Icon size={14} aria-hidden />
                </Box>
                <Box as="span" minW="0" overflowWrap="anywhere">
                  {basics(visibility)}
                </Box>
                {file && fileTab === visibility && (
                  <Badge colorPalette="blue">1</Badge>
                )}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        {visibilities.map((visibility) => (
          <Tabs.Content
            key={visibility}
            value={visibility}
            p={{ base: '4', md: '5' }}
          >
            {file && fileTab === visibility ? (
              <ArticlePdfFileCard file={file}>
                {file.visibility === 'RESEARCH_GROUP' && (
                  <Badge>{t('groupPdf')}</Badge>
                )}
                {downloadAction}
                <Menu.Root>
                  <Menu.Trigger asChild>
                    <Button size="sm" variant="outline" ms="auto">
                      {t('fileActions')}
                      <ChevronDown aria-hidden />
                    </Button>
                  </Menu.Trigger>
                  <Portal>
                    <Menu.Positioner>
                      <Menu.Content shadow="overlayPanel">
                        <Menu.Item
                          value="replace"
                          layerStyle="interactiveRow"
                          onSelect={() => onPickFile(visibility)}
                        >
                          {basics('replace')}
                        </Menu.Item>
                        <Menu.Item
                          value="manage"
                          layerStyle="interactiveRow"
                          onSelect={() => {
                            setAction('');
                            setFailure(undefined);
                            setTarget(file);
                          }}
                        >
                          {t('changeOrRemove')}
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Positioner>
                  </Portal>
                </Menu.Root>
              </ArticlePdfFileCard>
            ) : (
              <chakra.button
                type="button"
                display="flex"
                flexDirection="column"
                w="full"
                borderWidth="1px"
                borderStyle="dashed"
                borderColor="border.emphasized"
                alignItems="center"
                gap="3"
                p={{ base: '4', md: '6' }}
                textAlign="center"
                focusVisibleRing="outside"
                cursor="button"
                _hover={{ bg: 'bg.subtle', borderColor: 'blue.solid' }}
                onClick={() => onPickFile(visibility)}
              >
                <Box as="span" display="inline-flex" position="relative">
                  <ArticleIllustration kind="pdf-file" />
                  <Box
                    as="span"
                    position="absolute"
                    bottom="0"
                    insetEnd="-1"
                    color="blue.fg"
                    bg="bg.panel"
                    borderRadius="50%"
                  >
                    <CirclePlus size={20} aria-hidden />
                  </Box>
                </Box>
                <Text
                  as="span"
                  color="blue.fg"
                  fontWeight="semibold"
                  textStyle="sm"
                >
                  {file
                    ? basics('replace')
                    : t(visibility === 'PRIVATE' ? 'addPrivate' : 'addPublic')}
                </Text>
                <Text
                  as="span"
                  textStyle={{ base: 'xs', md: 'sm' }}
                  color="fg.muted"
                >
                  {file
                    ? t('fileInOtherTab')
                    : basics(
                        visibility === 'PRIVATE' ? 'privateHint' : 'publicHint',
                      )}
                </Text>
              </chakra.button>
            )}
          </Tabs.Content>
        ))}
      </Tabs.Root>
      <ConfirmationModal
        open={Boolean(target)}
        onClose={() => setTarget(undefined)}
        title={t('manageTitle')}
        description={target?.name}
        confirmLabel={
          action === 'remove'
            ? t('removePdf')
            : action === 'visibility'
              ? changeLabel
              : t('confirm')
        }
        colorPalette={action === 'remove' ? 'red' : 'blue'}
        onConfirm={confirm}
        isConfirming={isWorking}
        isConfirmDisabled={!action}
        body={
          <>
            <RadioGroup.Root
              aria-label={t('manageTitle')}
              value={action}
              onValueChange={({ value }) => setAction(value ?? '')}
              variant="outline"
              colorPalette="blue"
              disabled={isWorking}
            >
              <Stack gap="3">
                {[
                  {
                    value: 'visibility',
                    label: changeLabel,
                    hint: basics(
                      nextVisibility === 'PRIVATE'
                        ? 'privateHint'
                        : 'publicHint',
                    ),
                  },
                  {
                    value: 'remove',
                    label: t('removePdf'),
                    hint: t('removeHint'),
                  },
                ].map(({ value, label, hint }) => (
                  <RadioGroup.Item
                    key={value}
                    value={value}
                    borderWidth="1px"
                    p={{ base: '3', md: '4' }}
                    alignItems="start"
                    cursor="pointer"
                    _checked={{ borderColor: 'blue.solid', bg: 'bg.subtle' }}
                  >
                    <RadioGroup.ItemHiddenInput />
                    <RadioGroup.ItemIndicator
                      mt="0.5"
                      borderRadius="50%"
                      borderColor="border.emphasized"
                      _checked={{
                        color: 'blue.solid',
                        borderColor: 'blue.solid',
                      }}
                      css={{ '& .dot': { borderRadius: '50%' } }}
                    />
                    <RadioGroup.ItemText asChild>
                      <Stack gap="1">
                        <Text fontWeight="semibold">{label}</Text>
                        <Text textStyle="sm" color="fg.muted">
                          {hint}
                        </Text>
                      </Stack>
                    </RadioGroup.ItemText>
                  </RadioGroup.Item>
                ))}
              </Stack>
            </RadioGroup.Root>
            {failure && (
              <Text role="alert" color="fg.error">
                {failure}
              </Text>
            )}
          </>
        }
      />
    </Box>
  );
}
