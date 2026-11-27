'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The leave guard's state.
 */
export interface OnboardingLeaveGuard {
  /** Whether the confirmation modal is open. */
  isConfirmOpen: boolean;
  /** The URL the researcher was about to go to, or null. */
  pendingHref: string | null;
  /** Goes to the remembered URL, losing the draft. */
  confirmLeave: () => void;
  /** Stays on the page and closes the modal. */
  cancelLeave: () => void;
}

/**
 * Warns the researcher before they leave the onboarding.
 *
 * ## Why a guard at all
 *
 * The onboarding draft lives in memory only. A reload, a closed tab or
 * a navigation to another page empties it, and the researcher's answers
 * are gone. The flow therefore has to warn them before they go — the
 * platform would otherwise let a researcher type a whole profile and
 * lose it to a stray click.
 *
 * ## Why there are two kinds of warning
 *
 * The browser allows exactly one intervention on a hard unload: the
 * `beforeunload` event, which shows the browser's own confirmation
 * dialog. Its copy is the browser's, not ours, so it cannot explain
 * what is lost.
 *
 * An in-app navigation is a different matter: it is a normal click on
 * a link, and the app can intercept it. That path gets the shared
 * `ConfirmationModal` instead, so the researcher reads why they are
 * being stopped and can cancel.
 *
 * ## Why clicks are caught in the capture phase
 *
 * Next's `Link` navigates from its own click handler, and it bails out
 * when the event is already prevented. Catching the click while it is
 * still descending — the capture phase on the document — means the
 * router never gets to run, and the link stays a plain link for a
 * reader who has JavaScript disabled.
 */
export function useOnboardingLeaveGuard({
  isActive,
}: {
  /**
   * Whether there is anything to lose.
   *
   * The guard is a no-op while this is false, so a researcher who has
   * answered nothing is never nagged.
   */
  isActive: boolean;
}): OnboardingLeaveGuard {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const isConfirmOpen = pendingHref !== null;

  /*
   * The pending href is kept in a ref as well as in the state, so the
   * confirm handler never reads a stale copy of it.
   */
  const pendingHrefRef = useRef<string | null>(null);

  /*
   * Set once the researcher has confirmed the leave. The unload
   * listener reads it and stays quiet, so the browser does not ask
   * twice: the researcher already answered.
   */
  const isLeavingRef = useRef(false);

  const openConfirm = useCallback((href: string) => {
    pendingHrefRef.current = href;
    setPendingHref(href);
  }, []);

  const cancelLeave = useCallback(() => {
    pendingHrefRef.current = null;
    setPendingHref(null);
  }, []);

  const confirmLeave = useCallback(() => {
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    setPendingHref(null);
    if (href) {
      /*
       * The researcher has answered, so the browser's own unload
       * dialog would only ask the same question a second time.
       */
      isLeavingRef.current = true;
      /*
       * A full navigation rather than the router's push: the point of
       * the confirmation is that the researcher decided to leave, and a
       * hard navigation is what the browser's own dialog would have
       * done.
       */
      window.location.href = href;
    }
  }, []);

  /*
   * The hard unload: a reload, a closed tab, or a typed address. The
   * browser shows its own dialog and the wording is the browser's.
   */
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isLeavingRef.current) {
        return;
      }
      event.preventDefault();
      /*
       * The empty string is what modern browsers expect. Older ones
       * read the message, but the browser's own copy is used anyway.
       */
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isActive]);

  /*
   * The in-app navigation: a click on a link that points somewhere
   * else. The click is stopped and the modal takes over.
   */
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      /*
       * Only a plain left click is a navigation the researcher
       * intended. A middle click, a modified click or a click on a
       * download opens something else and leaves this page standing.
       */
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest('a');
      if (!anchor) {
        return;
      }

      /*
       * A link that opens another tab or downloads a file does not
       * take the researcher away from this page.
       */
      const anchorTarget = anchor.getAttribute('target');
      if (
        (anchorTarget && anchorTarget !== '_self') ||
        anchor.hasAttribute('download')
      ) {
        return;
      }

      const href = anchor.href;
      if (!href) {
        return;
      }

      /*
       * Only http(s) links navigate the page. `mailto:` and `tel:`
       * hand over to another application and leave the draft alone.
       */
      const destination = new URL(href, window.location.href);
      if (
        destination.protocol !== 'http:' &&
        destination.protocol !== 'https:'
      ) {
        return;
      }

      const here = new URL(window.location.href);
      if (
        destination.origin === here.origin &&
        destination.pathname === here.pathname &&
        destination.search === here.search
      ) {
        /*
         * The same page — a hash link or a link back to this route.
         * Leaving the page is not what the researcher is doing.
         */
        return;
      }

      event.preventDefault();
      openConfirm(destination.href);
    };

    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [isActive, openConfirm]);

  return { isConfirmOpen, pendingHref, confirmLeave, cancelLeave };
}
