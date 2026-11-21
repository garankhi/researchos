'use client';

import {
  IconButton,
  Menu,
  Portal,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Ellipsis, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { ErrorState } from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import type { OutputCapability } from '@/utils/output-capability';
import { useOutputVisibility } from '../hooks/use-output-visibility';
import type { OutputResponseDto } from '../types';

type VisibilityChoice = 'FPTU_COMMUNITY' | 'RESEARCH_GROUP';

/**
 * Per-card action menu for a work on the profile page.
 *
 * The menu owns the card's operations; visibility is the first of them —
 * one entry that opens a dialog with the two audiences. The affiliation
 * itself is left untouched: the request omits `accessGroupId`, so the
 * backend keeps the stored group. A work with no stored group cannot
 * become group-only, so that option stays disabled.
 *
 * The Visibility entry carries its own permission. A co-author sees their
 * own work listed on the profile, but the backend only lets the owner (or
 * the affiliated group's lead) change the visibility — so the entry is
 * disabled with a reason rather than opening a dialog that would fail on
 * save with a 403.
 */
export function ProfileOutputActionsMenu({
  output,
  capability,
}: {
  output: OutputResponseDto;
  capability: OutputCapability;
}) {
  const t = useTranslations('profile');
  const tError = useTranslations('errors');
  const tCommon = useTranslations('common');
  const { showSnackbar } = useSnackbar();
  const { updateVisibility, isPending } = useOutputVisibility();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selection, setSelection] = useState<VisibilityChoice>(
    output.visibility === 'RESEARCH_GROUP'
      ? 'RESEARCH_GROUP'
      : 'FPTU_COMMUNITY',
  );
  const [inlineError, setInlineError] = useState<string | null>(null);

  const hasGroup = Boolean(output.accessGroupId);
  const isShared = output.sharingStatus === 'SHARED';
  const canChangeVisibility = isShared && capability.canChangeVisibility;

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
        message: t('outputsTab.visibilityUpdated'),
        severity: 'success',
      });
      setDialogOpen(false);
    } catch (error) {
      setInlineError(
        resolveErrorCode(
          tError,
          apiErrorCode(error),
          t('outputsTab.visibilityUpdateError'),
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
            aria-label={t('outputsTab.actionsMenuLabel')}
          >
            <Ellipsis />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content boxShadow="overlayPanel">
              <Menu.Item
                value="visibility"
                layerStyle="interactiveRow"
                onSelect={openDialog}
                disabled={!canChangeVisibility}
              >
                <Eye />
                {t('outputsTab.visibilityAction')}
                {canChangeVisibility ? null : (
                  <Text textStyle="xs" color="fg.muted">
                    {t('outputsTab.visibilityLockedReason')}
                  </Text>
                )}
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      <ConfirmationModal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={t('outputsTab.visibilityDialogTitle')}
        description={t('outputsTab.visibilityDialogDesc')}
        body={
          <>
            {inlineError ? (
              <ErrorState
                title={t('outputsTab.visibilityUpdateError')}
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
                      {t('outputsTab.visibilityPublicOption')}
                    </RadioGroup.ItemText>
                    <Text textStyle="sm" color="fg.muted">
                      {t('outputsTab.visibilityPublicDesc')}
                    </Text>
                  </Stack>
                </RadioGroup.Item>

                <RadioGroup.Item value="RESEARCH_GROUP" disabled={!hasGroup}>
                  <RadioGroup.ItemHiddenInput />
                  <RadioGroup.ItemIndicator />
                  <Stack gap="0">
                    <RadioGroup.ItemText>
                      {t('outputsTab.visibilityGroupOption')}
                    </RadioGroup.ItemText>
                    <Text textStyle="sm" color="fg.muted">
                      {hasGroup
                        ? t('outputsTab.visibilityGroupDesc')
                        : t('outputsTab.visibilityNoGroupHint')}
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
