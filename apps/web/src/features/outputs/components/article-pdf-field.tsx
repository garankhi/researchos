import { useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Eye, EyeOff, Info, Trash2, Upload } from 'lucide-react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Heading,
  HStack,
  Input,
  RadioGroup,
  Spinner,
  Stack,
  Text,
  VisuallyHidden,
} from '@chakra-ui/react';
import { useFormatter, useTranslations } from 'next-intl';
import type { CreateArticleDtoFileVisibility } from '@/lib/api/models/createArticleDtoFileVisibility';
import type { useArticlePdfPreview } from '../hooks/use-article-pdf-preview';
import { ArticleIllustration } from './article-illustration';

type PdfPreview = ReturnType<typeof useArticlePdfPreview>;
type PdfSelection = {
  file: File;
  visibility?: CreateArticleDtoFileVisibility;
  rights: boolean;
};

export function ArticlePdfUpload({
  pdf,
  onUpload,
  onRemove,
  onSkip,
  onContinue,
}: {
  pdf: PdfPreview;
  onUpload: (file: File, visibility: CreateArticleDtoFileVisibility) => void;
  onRemove: () => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const visibilityFields = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PdfSelection>();
  const [invalid, setInvalid] = useState(false);
  const t = useTranslations('articleBasics');
  const { file, phase, progress, uploadId, visibility } = pdf;
  const visibleFile = pending?.file ?? file;
  const busy = phase === 'uploading' || phase === 'reading';
  const status =
    phase === 'uploading'
      ? t('uploading', { percent: progress })
      : phase === 'selected' || phase === 'failed'
        ? undefined
        : t(phase);

  return (
    <Box bg="bg.panel" maxW="3xl" mx="auto">
      <Stack gap="6" p={{ base: '5', md: '9' }}>
        <Heading as="h2" size="xl">
          {t('addFile')}
        </Heading>
        <Input
          hidden
          type="file"
          accept="application/pdf,.pdf"
          ref={input}
          aria-label={t('select')}
          onChange={(event) => {
            const next = event.target.files?.[0];
            event.target.value = '';
            if (!next || busy) return;
            const valid =
              next.name.toLowerCase().endsWith('.pdf') &&
              next.size > 0 &&
              next.size <= 50 * 1024 * 1024;
            setInvalid(!valid);
            if (valid) {
              setPending({ file: next, rights: false });
              requestAnimationFrame(() => {
                visibilityFields.current?.querySelector('input')?.focus();
              });
            }
          }}
        />
        {visibleFile && (
          <PdfFileCard file={visibleFile}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              ms="auto"
              onClick={() => {
                setInvalid(false);
                if (pending) setPending(undefined);
                else onRemove();
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            >
              <Trash2 aria-hidden />
              {t('remove')}
            </Button>
          </PdfFileCard>
        )}
        {pending ? (
          <Stack ref={visibilityFields} gap="5">
            <PdfVisibilityFields selection={pending} onChange={setPending} />
          </Stack>
        ) : busy ? (
          <Flex
            minH="12"
            align="center"
            justify="center"
            borderWidth="1px"
            borderColor="blue.solid"
            color="blue.fg"
            textStyle="sm"
            aria-hidden
          >
            {phase === 'reading' ? (
              <Spinner
                size="sm"
                borderWidth="1.5px"
                borderRadius="50%"
                css={{
                  '--spinner-track-color': 'colors.border',
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              />
            ) : (
              status
            )}
          </Flex>
        ) : (
          <Button
            ref={trigger}
            type="button"
            variant="outline"
            colorPalette="blue"
            w="full"
            minH="12"
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden />
            {t(file ? 'replace' : 'select')}
          </Button>
        )}
        <VisuallyHidden role="status">{!pending && status}</VisuallyHidden>
        {invalid && (
          <Text role="alert" color="fg.error" textStyle="sm">
            {t('invalidPdf')}
          </Text>
        )}
        {!pending && phase === 'failed' && file && visibility && (
          <Flex align="center" gap="3" wrap="wrap">
            <Text role="alert" color="fg.error" textStyle="sm" flex="1 1 12rem">
              {t('failed')}
            </Text>
            <Button type="button" onClick={() => onUpload(file, visibility)}>
              {t('retry')}
            </Button>
          </Flex>
        )}
      </Stack>
      <Flex
        borderTopWidth="1px"
        p="4"
        direction={{ base: 'column', sm: 'row' }}
        align={{ base: 'stretch', sm: 'center' }}
        gap="3"
      >
        <HStack flex="1" align="start" gap="2" color="fg.muted">
          <Box flexShrink="0" mt="0.5">
            <Info size={18} aria-hidden />
          </Box>
          <Text textStyle="sm">{t('nextHint')}</Text>
        </HStack>
        <Flex gap="2" justify="end" wrap="wrap">
          <Button type="button" variant="ghost" onClick={onSkip}>
            {t('skip')}
          </Button>
          {pending ? (
            <Button
              type="button"
              disabled={!pending.visibility || !pending.rights}
              onClick={() => {
                if (!pending.visibility || !pending.rights) return;
                setPending(undefined);
                onUpload(pending.file, pending.visibility);
              }}
            >
              {t('upload')}
            </Button>
          ) : (
            uploadId &&
            !busy && (
              <Button type="button" onClick={onContinue}>
                {t('next')}
              </Button>
            )
          )}
        </Flex>
      </Flex>
    </Box>
  );
}

function PdfFileCard({ file, children }: { file: File; children?: ReactNode }) {
  const format = useFormatter();
  return (
    <Flex align="center" gap="3" wrap="wrap" borderWidth="1px" p="3">
      <HStack gap="3" flex="1 1 11rem" minW="0">
        <Box flexShrink="0">
          <ArticleIllustration kind="pdf-file" />
        </Box>
        <Box minW="0">
          <Text fontWeight="semibold" overflowWrap="anywhere">
            {file.name}
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {format.number(file.size / 1024, { maximumFractionDigits: 1 })} KiB
          </Text>
        </Box>
      </HStack>
      {children}
    </Flex>
  );
}

function PdfVisibilityFields({
  selection,
  onChange,
}: {
  selection: PdfSelection;
  onChange: (selection: PdfSelection) => void;
}) {
  const t = useTranslations('articleBasics');
  return (
    <>
      <RadioGroup.Root
        colorPalette="blue"
        variant="outline"
        orientation="vertical"
        value={selection.visibility ?? null}
        onValueChange={({ value }) => {
          if (value === 'PRIVATE' || value === 'FPTU_COMMUNITY')
            onChange({ ...selection, visibility: value });
        }}
      >
        <RadioGroup.Label>{t('selectAccess')}</RadioGroup.Label>
        <Stack gap="2" mt="2">
          {(['FPTU_COMMUNITY', 'PRIVATE'] as const).map((value) => {
            const Icon = value === 'PRIVATE' ? EyeOff : Eye;
            return (
              <RadioGroup.Item
                key={value}
                value={value}
                w="full"
                borderWidth="1px"
                borderRadius="9999px"
                borderColor="blue.solid"
                bg="bg.panel"
                color="blue.fg"
                px={{ base: '4', sm: '3' }}
                py="1.5"
                gap={{ base: '2', sm: '2.5' }}
                cursor="pointer"
                _hover={{ bg: 'blue.subtle' }}
                _checked={{
                  bg: 'blue.solid',
                  color: 'white',
                  _hover: { bg: 'blue.solid' },
                }}
                _focusVisible={{
                  outline: '2px solid',
                  outlineColor: 'blue.fg',
                  outlineOffset: '2px',
                }}
              >
                <RadioGroup.ItemHiddenInput />
                <Box flexShrink="0">
                  <Icon size={20} aria-hidden />
                </Box>
                <RadioGroup.ItemText flex="1" minW="0" color="inherit">
                  <Text as="span" display="block" fontWeight="semibold">
                    {t(value)}
                  </Text>
                  <Text
                    as="span"
                    display="block"
                    fontSize="sm"
                    fontWeight="normal"
                    overflowWrap="anywhere"
                  >
                    {t(value === 'PRIVATE' ? 'privateHint' : 'publicHint')}
                  </Text>
                </RadioGroup.ItemText>
                <RadioGroup.ItemIndicator
                  borderRadius="50%"
                  color="inherit"
                  borderColor="currentColor"
                  _checked={{
                    color: 'inherit',
                    borderColor: 'currentColor',
                  }}
                  css={{ '& .dot': { borderRadius: '50%' } }}
                />
              </RadioGroup.Item>
            );
          })}
        </Stack>
      </RadioGroup.Root>
      <Checkbox.Root
        checked={selection.rights}
        onCheckedChange={({ checked }) =>
          onChange({ ...selection, rights: checked === true })
        }
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>{t('rights')}</Checkbox.Label>
      </Checkbox.Root>
    </>
  );
}

export function ArticlePdfSummary({
  file,
  phase,
}: Pick<PdfPreview, 'file' | 'phase'>) {
  const t = useTranslations('articleBasics');
  if (!file) return null;

  const hasSuggestions = phase === 'ready' || phase === 'abstractOnly';
  const message =
    phase === 'ready' ||
    phase === 'abstractOnly' ||
    phase === 'manual' ||
    phase === 'waiting'
      ? t(phase)
      : undefined;

  return (
    <Stack gap="3">
      <Text textStyle="sm" fontWeight="bold">
        {t('fileOptional')}
      </Text>
      <Text
        borderWidth="1px"
        p="3"
        fontWeight="semibold"
        overflowWrap="anywhere"
      >
        {file.name}
      </Text>
      <HStack role="status" gap="2" color="fg.muted" textStyle="sm">
        {hasSuggestions && (
          <Box flexShrink="0">
            <CircleCheck size={16} aria-hidden />
          </Box>
        )}
        {message && <Text>{message}</Text>}
      </HStack>
    </Stack>
  );
}
