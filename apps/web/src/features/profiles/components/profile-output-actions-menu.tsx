'use client';

import {
  Button,
  Dialog,
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
import { ErrorState } from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
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
 */
export function ProfileOutputActionsMenu({
  output,
}: {
  output: OutputResponseDto;
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
  const canEdit = output.sharingStatus === 'SHARED';

  if (!canEdit) return null;

  const openDialog = () => {
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
            <Menu.Content>
              <Menu.Item value="visibility" onSelect={openDialog}>
                <Eye />
                {t('outputsTab.visibilityAction')}
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      <Dialog.Root
        open={dialogOpen}
        onOpenChange={(details) => {
          if (!details.open) setDialogOpen(false);
        }}
        placement="center"
        motionPreset="scale"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header
                flexDirection="column"
                alignItems="flex-start"
                gap="1"
              >
                <Dialog.Title>
                  {t('outputsTab.visibilityDialogTitle')}
                </Dialog.Title>
                <Dialog.Description textStyle="sm" color="fg.muted">
                  {t('outputsTab.visibilityDialogDesc')}
                </Dialog.Description>
              </Dialog.Header>

              <Dialog.Body>
                <Stack gap="4">
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

                      <RadioGroup.Item
                        value="RESEARCH_GROUP"
                        disabled={!hasGroup}
                      >
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
                </Stack>
              </Dialog.Body>

              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isPending}
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  onClick={() => void handleSave()}
                  loading={isPending}
                >
                  {tCommon('save')}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
