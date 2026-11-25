'use client';

import {
  IconButton,
  Menu,
  Portal,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Ellipsis, Eye, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { ErrorState } from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import type { OutputCapability } from '@/utils/output-capability';
import { useOutputVisibility } from '../hooks/use-output-visibility';
import type { OutputDetail } from '../types';
import { EditPublishedArticle } from './edit-published-article';

type VisibilityChoice = 'FPTU_COMMUNITY' | 'RESEARCH_GROUP';

/**
 * Action menu on the output detail page.
 *
 * The menu is the work's operation container, so it stays mounted — more
 * operations will live here. Each entry carries its own permission: the
 * Visibility entry is disabled when the viewer may not change the
 * visibility, and says why, rather than opening an editable dialog that
 * would fail on save with a 403.
 *
 * The affiliation itself is left untouched: the request omits
 * `accessGroupId`, so the backend keeps the stored group. A work with no
 * stored group cannot become group-only, so that option stays disabled.
 */
export function OutputDetailActionsMenu({
  output,
  capability,
}: {
  output: OutputDetail;
  capability: OutputCapability;
}) {
  const t = useTranslations('outputs');
  const tError = useTranslations('errors');
  const tCommon = useTranslations('common');
  const articleEdit = useTranslations('articleEdit');
  const { showSnackbar } = useSnackbar();
  const { updateVisibility, isPending } = useOutputVisibility();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<
    (OutputDetail & { revision: NonNullable<OutputDetail['revision']> }) | null
  >(null);
  const [selection, setSelection] = useState<VisibilityChoice>(
    output.visibility === 'RESEARCH_GROUP'
      ? 'RESEARCH_GROUP'
      : 'FPTU_COMMUNITY',
  );
  const [inlineError, setInlineError] = useState<string | null>(null);

  const hasGroup = Boolean(output.accessGroupId);
  const isShared = output.sharingStatus === 'SHARED';
  const canChangeVisibility = isShared && capability.canChangeVisibility;
  const revision = output.revision;
  const canEditArticle =
    isShared &&
    capability.isOwner &&
    revision?.outputType === 'ARTICLE' &&
    revision.releasedAt;

  const openDialog = () => {
    if (!canChangeVisibility) return;
    setSelection(
      output.visibility === 'RESEARCH_GROUP'
        ? 'RESEARCH_GROUP'
        : 'FPTU_COMMUNITY',
    );
    setInlineError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (selection === output.visibility || isPending) {
      setDialogOpen(false);
      return;
    }
    setInlineError(null);
    try {
      await updateVisibility(output.id, { visibility: selection });
      showSnackbar({
        message: t('detail.visibilityUpdated'),
        severity: 'success',
      });
      setDialogOpen(false);
    } catch (error) {
      setInlineError(
        resolveErrorCode(
          tError,
          apiErrorCode(error),
          t('detail.visibilityUpdateError'),
          'domain',
        ),
      );
    }
  };

  return (
    <>
      <Menu.Root positioning={{ placement: 'bottom-end' }}>
        <Menu.Trigger asChild>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('detail.actionsMenuLabel')}
          >
            <Ellipsis />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content boxShadow="overlayPanel">
              {canEditArticle && revision && (
                <Menu.Item
                  value="edit-article"
                  layerStyle="interactiveRow"
                  onSelect={() => setEditing({ ...output, revision })}
                >
                  <Pencil />
                  {articleEdit('edit')}
                </Menu.Item>
              )}
              <Menu.Item
                value="visibility"
                layerStyle="interactiveRow"
                onSelect={openDialog}
                disabled={!canChangeVisibility}
              >
                <Eye />
                {t('detail.visibilityAction')}
                {canChangeVisibility ? null : (
                  <Text textStyle="xs" color="fg.muted">
                    {t('detail.visibilityLockedReason')}
                  </Text>
                )}
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      {editing && capability.isOwner && capability.userId && (
        <EditPublishedArticle
          output={editing}
          userId={capability.userId}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmationModal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={t('detail.visibilityDialogTitle')}
        description={t('detail.visibilityDialogDesc')}
        body={
          <>
            {inlineError ? (
              <ErrorState
                title={t('detail.visibilityUpdateError')}
                message={inlineError}
              />
            ) : null}

            <RadioGroup.Root
              value={selection}
              onValueChange={(details) =>
                setSelection(details.value as VisibilityChoice)
              }
            >
              <Stack gap="3">
                <RadioGroup.Item value="FPTU_COMMUNITY">
                  <RadioGroup.ItemHiddenInput />
                  <RadioGroup.ItemIndicator />
                  <Stack gap="0">
                    <RadioGroup.ItemText>
                      {t('detail.visibilityPublicOption')}
                    </RadioGroup.ItemText>
                    <Text textStyle="sm" color="fg.muted">
                      {t('detail.visibilityPublicDesc')}
                    </Text>
                  </Stack>
                </RadioGroup.Item>

                <RadioGroup.Item value="RESEARCH_GROUP" disabled={!hasGroup}>
                  <RadioGroup.ItemHiddenInput />
                  <RadioGroup.ItemIndicator />
                  <Stack gap="0">
                    <RadioGroup.ItemText>
                      {t('detail.visibilityGroupOption')}
                    </RadioGroup.ItemText>
                    <Text textStyle="sm" color="fg.muted">
                      {hasGroup
                        ? t('detail.visibilityGroupDesc')
                        : t('detail.visibilityNoGroupHint')}
                    </Text>
                  </Stack>
                </RadioGroup.Item>
              </Stack>
            </RadioGroup.Root>
          </>
        }
        confirmLabel={tCommon('save')}
        colorPalette="blue"
        isConfirming={isPending}
        isConfirmDisabled={selection === output.visibility}
        onConfirm={() => void handleSave()}
      />
    </>
  );
}
