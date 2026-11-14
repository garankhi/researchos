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
      placement: 'bottom-end',
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
        <Toaster toaster={toaster} insetInline={{ base: '3', sm: '6' }}>
          {(toast) => (
            <Toast.Root role={toast.type === 'error' ? 'alert' : 'status'}>
              <Toast.Indicator />
              <Toast.Description>{toast.description}</Toast.Description>
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
