'use client';

import { create } from 'zustand';
import type { CurrentUser } from '../types';

/**
 * The client-side session state.
 *
 * ## Why this store exists next to the query cache
 *
 * `GET /me` already lives in the TanStack Query cache, so there are two
 * places the signed-in account could live. The store is here because the
 * header and the account menu need the account **synchronously**, on their
 * very first render:
 *
 * - the query cache is empty on a hard reload, so a component that reads
 *   it renders "signed out" first and flips to "signed in" a moment later;
 * - the store is written as soon as the login response arrives, so the
 *   name and the avatar are already right when the redirect lands.
 *
 * The store is a **cache of the session**, not the source of truth. The
 * session cookie is the source of truth, and `GET /me` is what decides
 * whether it is still valid. The store is refreshed from that answer and
 * cleared when the session ends.
 *
 * ## Why it is not persisted
 *
 * A persisted store would show a name for a session that expired while the
 * browser was closed — the header would claim the user is signed in until
 * the first `GET /me` answered. The session is a cookie with its own
 * lifetime, so the client keeps no copy of it across reloads.
 *
 * ## Why it is not shared between tabs
 *
 * Two tabs of the same app are two documents, and each has its own store.
 * A sign-out in one tab does not clear the other — but the other tab's
 * `GET /me` answers `401` as soon as it is asked again, and that is what
 * clears the store there. The cookie is the thing that is shared, and it
 * is the authority.
 */
interface SessionState {
  /** The signed-in account, or `null` when nobody is signed in. */
  user: CurrentUser | null;
  /**
   * Whether the session has been checked.
   *
   * `null` alone cannot tell "signed out" from "not known yet" — the
   * header needs the difference to decide between the sign-in button and
   * a placeholder.
   */
  isResolved: boolean;
  /** Records the signed-in account. */
  setUser: (user: CurrentUser) => void;
  /** Forgets the account — the session ended or was never there. */
  clearUser: () => void;
  /**
   * Marks the session as checked without changing the account.
   *
   * A failed `GET /me` — the API is down, the network dropped — says
   * nothing about the session, so the account stays but the header stops
   * waiting for an answer that is never coming.
   */
  markResolved: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  user: null,
  isResolved: false,

  setUser: (user) => set({ user, isResolved: true }),

  clearUser: () => set({ user: null, isResolved: true }),

  markResolved: () => set({ isResolved: true }),
}));
