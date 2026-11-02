'use client';

import { Alert, Button, Snackbar } from '@mui/material';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Application-wide snackbar.
 *
 * Why this exists: a snackbar is a *notification* channel, not a state
 * channel. It is the right home for a success confirmation — the page is
 * already correct, the toast confirms and gets out of the way — and for
 * errors that have no local anchor (a background sync, a failed logout).
 *
 * It is the wrong home for an error next to a field or a panel. An error
 * that auto-hides is an error the user will hit again, so those render
 * inline instead. See the `researchos-ui` skill.
 *
 * Mount it once, near the root, so a snackbar survives client-side
 * navigation. The provider is a Client Component: `Snackbar` needs
 * `useSnackbar` from the MUI context to anchor correctly.
 *
 * Example:
 *
 * ```tsx
 * const { showSnackbar } = useSnackbar();
 *
 * showSnackbar({ severity: 'success', message: t('saved') });
 * ```
 */

export type SnackbarSeverity = 'success' | 'info' | 'warning' | 'error';

export interface SnackbarOptions {
  /** How the toast reads. `success` is polite, `error` is assertive. */
  severity?: SnackbarSeverity;
  /** The text. Prefer a translated string from the catalog. */
  message: string;
  /**
   * How long the toast stays visible, in milliseconds.
   *
   * `null` disables auto-hide. Use it for an error the user has to act on —
   * a toast that vanishes after four seconds is a message many users never
   * finish reading.
   */
  autoHideDuration?: number | null;
  /**
   * Label for an optional recovery action, e.g. "Retry". Rendered as a
   * button inside the toast.
   */
  actionLabel?: string;
  /** Called when the action button is pressed. */
  onAction?: () => void;
}

interface SnackbarContextValue {
  showSnackbar: (options: SnackbarOptions) => void;
  closeSnackbar: () => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarOptions | null>(null);

  const showSnackbar = useCallback((options: SnackbarOptions) => {
    setSnackbar(options);
  }, []);

  const closeSnackbar = useCallback(() => {
    setSnackbar(null);
  }, []);

  const value = useMemo(
    () => ({ showSnackbar, closeSnackbar }),
    [showSnackbar, closeSnackbar],
  );

  // A successful mutation auto-hides; an error does not. The default here
  // matches the success case, which is the common one.
  const autoHideDuration =
    snackbar?.autoHideDuration === undefined
      ? snackbar?.severity === 'error'
        ? null
        : 4000
      : snackbar.autoHideDuration;

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        open={snackbar !== null}
        autoHideDuration={autoHideDuration}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{
          content: {
            // `SnackbarContent` wraps the child and defaults to
            // `role="alert"`. The `Alert` inside it carries its own role,
            // so the wrapper is marked `presentation` — otherwise the live
            // region announces the message twice.
            role: 'presentation',
          },
        }}
      >
        <Alert
          severity={snackbar?.severity ?? 'info'}
          variant="filled"
          // The one live region. `alert` is assertive — right for an error.
          // `status` is polite — right for a success, which should not
          // interrupt a screen reader.
          role={snackbar?.severity === 'error' ? 'alert' : 'status'}
          onClose={closeSnackbar}
          action={
            snackbar?.actionLabel && snackbar.onAction ? (
              <AlertActionButton
                label={snackbar.actionLabel}
                onClick={snackbar.onAction}
              />
            ) : null
          }
        >
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

function AlertActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button color="inherit" size="small" onClick={onClick}>
      {label}
    </Button>
  );
}

/**
 * Access the application snackbar.
 *
 * Throws outside a `SnackbarProvider` rather than silently doing nothing —
 * a missing provider is a wiring bug, and a silent no-op would look like a
 * snackbar that never appears.
 */
export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext);

  if (!context) {
    throw new Error(
      'useSnackbar must be used inside a <SnackbarProvider>. Mount the provider near the root layout.',
    );
  }

  return context;
}
