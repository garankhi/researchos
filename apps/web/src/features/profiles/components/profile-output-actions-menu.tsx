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
import type { UpdateOutputVisibilityDtoAudience } from '@/lib/api/models/updateOutputVisibilityDtoAudience';
import { resolveErrorCode } from '@/utils/error-messages';
import type { OutputCapability } from '@/utils/output-capability';
import { useOutputVisibility } from '../hooks/use-output-visibility';
import type { OutputResponseDto } from '../types';

/**
 * Per-card action menu for a work on the profile page.
 *
 * The menu owns the card's operations; visibility is the first of them —
 * one entry that opens a dialog with the audiences the scope of the work
 * allows.
 *
 * The Visibility entry carries its own permission. A poster sees their own
 * work listed on the profile, but for a work of a group or a project the
 * container owns it — the leads decide, not the poster — so the entry is
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
  const [selection, setSelection] = useState<UpdateOutputVisibilityDtoAudience>(
    output.audience,
  );
  const [inlineError, setInlineError] = useState<string | null>(null);

  const isShared = output.sharingStatus === 'SHARED';
  const canChangeVisibility = isShared && capability.canChangeVisibility;

  const openDialog = () => {
    if (!canChangeVisibility) return;
    setSelection(output.audience);
    setInlineError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (selection === output.audience || isPending) {
      setDialogOpen(false);
      return;
    }
    setInlineError(null);
    try {
      await updateVisibility(output.id, { audience: selection });
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

  const renderAudienceOption = (
    value: UpdateOutputVisibilityDtoAudience,
    labelKey: string,
    descKey: string,
  ) => (
    <RadioGroup.Item value={value}>
      <RadioGroup.ItemHiddenInput />
      <RadioGroup.ItemIndicator />
      <Stack gap="0">
        <RadioGroup.ItemText>{t(labelKey)}</RadioGroup.ItemText>
        <Text textStyle="sm" color="fg.muted">
          {t(descKey)}
        </Text>
      </Stack>
    </RadioGroup.Item>
  );

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
                setSelection(details.value as UpdateOutputVisibilityDtoAudience)
              }
            >
              <Stack gap="3">
                {capability.allowedAudiences.includes('PRIVATE') &&
                  renderAudienceOption(
                    'PRIVATE',
                    'outputsTab.visibilityPrivateOption',
                    'outputsTab.visibilityPrivateDesc',
                  )}
                {capability.allowedAudiences.includes('CONTAINER') &&
                  renderAudienceOption(
                    'CONTAINER',
                    'outputsTab.visibilityContainerOption',
                    'outputsTab.visibilityContainerDesc',
                  )}
                {capability.allowedAudiences.includes('FPTU_COMMUNITY') &&
                  renderAudienceOption(
                    'FPTU_COMMUNITY',
                    'outputsTab.visibilityPublicOption',
                    'outputsTab.visibilityPublicDesc',
                  )}
              </Stack>
            </RadioGroup.Root>
          </>
        }
        confirmLabel={tCommon('save')}
        colorPalette="blue"
        isConfirming={isPending}
        isConfirmDisabled={selection === output.audience}
        onConfirm={() => void handleSave()}
      />
    </>
  );
}
