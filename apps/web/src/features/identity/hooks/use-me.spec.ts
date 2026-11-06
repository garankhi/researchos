import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthControllerMeQueryKey } from '@/lib/api';
import type { MeDto } from '@/lib/api/models';
import { useMe } from './use-me';
import { useSessionStore } from '../store/session-store';

// Render real hooks with React's server renderer, then flush this hook's
// effects explicitly. No DOM shim or transport mocks are needed: the real
// QueryObserver below reproduces cache retention after failed refetches.
const { effects } = vi.hoisted(() => ({ effects: [] as Array<() => unknown> }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => unknown) => {
      effects.push(effect);
    },
  };
});

const me: MeDto = {
  id: 'user-1',
  email: 'user@example.test',
  fullName: 'Test User',
  userType: 'STAFF',
  departmentUnit: 'Testing',
  academicTitle: null,
  academicDegree: null,
  roles: ['ADMIN'],
  onboardingCompleted: true,
  profileConfirmed: true,
  mustChangePassword: false,
};
const clients: QueryClient[] = [];

function renderMe(client: QueryClient) {
  let result: ReturnType<typeof useMe> | undefined;
  function Probe() {
    result = useMe();
    return null;
  }
  effects.length = 0;
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(Probe)),
  );
  for (const effect of effects.splice(0)) effect();
  return result!;
}

function cachedSession() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(getAuthControllerMeQueryKey(), me);
  renderMe(client);
  expect(useSessionStore.getState().user?.id).toBe(me.id);
  return client;
}

async function failRefetch(client: QueryClient, status: number) {
  const observer = new QueryObserver(client, {
    queryKey: getAuthControllerMeQueryKey(),
    retry: false,
    queryFn: async () => {
      throw new AxiosError('Request failed', undefined, undefined, undefined, {
        status,
      } as AxiosResponse);
    },
  });
  await observer.refetch();
  expect(observer.getCurrentResult().isError).toBe(true);
  // This is the original bug's precondition: an error still has cached data.
  expect(observer.getCurrentResult().data).toEqual(me);
  observer.destroy();
  return renderMe(client);
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  useSessionStore.setState({ user: null, isResolved: false });
  effects.length = 0;
});

describe('useMe with retained query data', () => {
  it('clears the store and hides cached data after a 401 refetch', async () => {
    const client = cachedSession();
    const result = await failRefetch(client, 401);
    expect(result.isSignedOut).toBe(true);
    expect(result.data).toBeUndefined();
    expect(useSessionStore.getState()).toMatchObject({
      user: null,
      isResolved: true,
    });
  });

  it('does not restore the expired account if the next refetch returns 500', async () => {
    const client = cachedSession();
    await failRefetch(client, 401);
    const result = await failRefetch(client, 500);
    expect(result.data).toBeUndefined();
    expect(useSessionStore.getState().user).toBeNull();
  });

  it('keeps a known session on a transient server failure', async () => {
    const client = cachedSession();
    const result = await failRefetch(client, 500);
    expect(result.isFailed).toBe(true);
    expect(result.isSignedOut).toBe(false);
    expect(useSessionStore.getState().user?.id).toBe(me.id);
  });

  it('accepts a fresh successful account after the expired session was cleared', async () => {
    const client = cachedSession();
    await failRefetch(client, 401);
    client.setQueryData(getAuthControllerMeQueryKey(), {
      ...me,
      id: 'new-user',
    });
    const result = renderMe(client);
    expect(result.isLoaded).toBe(true);
    expect(result.isSignedOut).toBe(false);
    expect(useSessionStore.getState().user?.id).toBe('new-user');
  });
});
