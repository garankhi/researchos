'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Heading,
  Portal,
  Text,
  chakra,
  useDialogContext,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { EmptyState } from '@/components/ui/feedback';
import { FormSubmitButton } from '@/components/ui/form';
import { apiErrorCode, apiStatusCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import {
  ArticleAbstractField,
  articleDetailsSchema,
} from './article-details-fields';
import { ArticleIllustration } from './article-illustration';

const abstractSchema = articleDetailsSchema.pick({ abstract: true });
type SaveAbstract = (value: string) => void | Promise<void>;

export function OutputAbstract({
  abstract,
  onSaveAbstract,
}: {
  abstract: string | null;
  onSaveAbstract?: SaveAbstract;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const t = useTranslations('outputs');

  return (
    <Box minW="0">
      <Box
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Heading
          as="h2"
          size="md"
          fontWeight="bold"
          ref={heading}
          tabIndex={-1}
        >
          {t('detail.abstractTitle')}
        </Heading>
      </Box>

      <Box p={{ base: '4', md: '6' }}>
        {abstract ? (
          <Text textStyle="sm" lineHeight="1.75" whiteSpace="pre-line">
            {abstract}
          </Text>
        ) : onSaveAbstract ? (
          <AddAbstractDialog
            onSave={async (value) => {
              await onSaveAbstract(value);
              requestAnimationFrame(() => heading.current?.focus());
            }}
          />
        ) : (
          <EmptyState
            title={t('detail.noAbstractTitle')}
            message={t('detail.noAbstractMessage')}
          />
        )}
      </Box>
    </Box>
  );
}

function AddAbstractDialog({ onSave }: { onSave: SaveAbstract }) {
  const t = useTranslations('articleEdit');
  const common = useTranslations('common');
  const fields = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog.Root
      size="md"
      placement="center"
      scrollBehavior="inside"
      closeOnEscape={!saving}
      closeOnInteractOutside={!saving}
      initialFocusEl={() => fields.current?.querySelector('textarea') ?? null}
      lazyMount
      unmountOnExit
    >
      <Dialog.Trigger asChild>
        <chakra.button
          type="button"
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap="3"
          w="full"
          p={{ base: '4', md: '6' }}
          textAlign="center"
          borderWidth="1px"
          borderStyle="dashed"
          borderColor="border.emphasized"
          cursor="button"
          focusVisibleRing="outside"
          _hover={{ bg: 'bg.subtle' }}
        >
          <ArticleIllustration kind="add-abstract" />
          <Text as="span" fontWeight="semibold">
            {t('addAbstract')}
          </Text>
          <Text as="span" textStyle="sm" color="fg.muted">
            {t('abstractHint')}
          </Text>
        </chakra.button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="bg.panel" shadow="overlayPanel" mx="4">
            <Dialog.Header>
              <Dialog.Title>{t('addAbstract')}</Dialog.Title>
            </Dialog.Header>
            <AbstractForm
              fieldRef={fields}
              onSave={async (value) => {
                setSaving(true);
                try {
                  await onSave(value);
                } finally {
                  setSaving(false);
                }
              }}
            />
            <Dialog.CloseTrigger asChild>
              <CloseButton
                size="sm"
                aria-label={common('close')}
                disabled={saving}
              />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function AbstractForm({
  onSave,
  fieldRef,
}: {
  onSave: SaveAbstract;
  fieldRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations('common');
  const edit = useTranslations('articleEdit');
  const errors = useTranslations('errors');
  const form = useForm({
    resolver: zodResolver(abstractSchema),
    defaultValues: { abstract: '' },
  });
  const { open, setOpen } = useDialogContext();
  const {
    reset,
    setError,
    clearErrors,
    formState: { errors: formErrors, isSubmitting },
  } = form;
  const abstract = useWatch({ control: form.control, name: 'abstract' });

  // A quick reopen can happen before the exit animation unmounts the fields.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <FormProvider {...form}>
      <chakra.form
        display="flex"
        flexDirection="column"
        minH="0"
        onSubmit={form.handleSubmit(async ({ abstract }) => {
          if (!abstract || isSubmitting) return;
          clearErrors('root.save');
          try {
            await onSave(abstract);
            setOpen(false);
          } catch (error) {
            const message =
              apiStatusCode(error) === 409
                ? edit('abstractRevisionChanged')
                : resolveErrorCode(
                    errors,
                    apiErrorCode(error),
                    edit('abstractSaveFailed'),
                  );
            setError('root.save', { message });
          }
        })}
      >
        <Dialog.Body ref={fieldRef}>
          <Box
            layerStyle="formFields"
            css={{
              '& textarea:focus:placeholder-shown': {
                backgroundImage:
                  'radial-gradient(circle, var(--chakra-colors-blue-solid) 3.5px, transparent 4px)',
                backgroundSize: '8px 8px',
                backgroundPosition: 'calc(var(--chakra-spacing-3) - 4px) 1px',
                backgroundRepeat: 'no-repeat',
              },
            }}
          >
            <ArticleAbstractField />
            {formErrors.root?.save?.message && (
              <Text role="alert" color="fg.error" textStyle="sm" mt="3">
                {formErrors.root.save.message}
              </Text>
            )}
          </Box>
        </Dialog.Body>
        <Dialog.Footer>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
          >
            {t('cancel')}
          </Button>
          <FormSubmitButton
            mutation={{ isPending: isSubmitting }}
            disabled={isSubmitting || !abstract.trim()}
            label={t('save')}
          />
        </Dialog.Footer>
      </chakra.form>
    </FormProvider>
  );
}
