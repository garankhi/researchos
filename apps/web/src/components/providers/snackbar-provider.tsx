'use client';

import { createToaster, Portal, Toast, Toaster } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useState, type ReactNode } from 'react';

type SnackbarSeverity = 'success' | 'info' | 'warning' | 'error';

interface SnackbarOptions {
  severity?: SnackbarSeverity;
  message: string;
  /** Pass null to keep the notification visible until dismissed. */
  autoHideDuration?: number | null;
  actionLabel?: string;
  onAction?: () => void;
}

interface SnackbarContextValue {
  showSnackbar: (options: SnackbarOptions) => void;
  closeSnackbar: () => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const [toaster] = useState(() =>
    createToaster({
      placement: 'top',
      pauseOnPageIdle: true,
    }),
  );
  const [value] = useState<SnackbarContextValue>(() => ({
    showSnackbar({
      severity = 'info',
      message,
      autoHideDuration,
      actionLabel,
      onAction,
    }) {
      const duration =
        autoHideDuration === null ||
        (autoHideDuration === undefined && severity === 'error')
          ? Infinity
          : (autoHideDuration ?? 4000);
      toaster.remove();
      toaster.create({
        type: severity,
        description: message,
        duration,
        action:
          actionLabel && onAction
            ? { label: actionLabel, onClick: onAction }
            : undefined,
      });
    },
    closeSnackbar() {
      toaster.dismiss();
    },
  }));

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Portal>
        <Toaster
          toaster={toaster}
          aria-label={t('notifications')}
          aria-keyshortcuts="Alt+T"
        >
          {(toast) => (
            <Toast.Root
              role={toast.type === 'error' ? 'alert' : 'status'}
              width="max-content"
              maxW="min(100%, 24rem)"
              pe="9"
              css={{
                '&[data-type=success]': {
                  bg: 'green.subtle',
                  color: 'green.fg',
                },
              }}
            >
              <Toast.Indicator />
              <Toast.Description
                minW="0"
                overflowWrap="anywhere"
                opacity={toast.type === 'success' ? '1' : undefined}
              >
                {toast.description}
              </Toast.Description>
              {toast.action && (
                <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
              )}
              <Toast.CloseTrigger aria-label={t('close')} />
            </Toast.Root>
          )}
        </Toaster>
      </Portal>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context)
    throw new Error('useSnackbar must be used inside a SnackbarProvider.');
  return context;
}
