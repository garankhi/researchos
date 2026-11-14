import 'reflect-metadata';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import './app.module.js';

const { configure } = vi.hoisted(() => ({
  configure: vi.fn<(options: { envFilePath?: string[] }) => Promise<unknown>>(),
}));

vi.mock('@nestjs/config', async (load) => {
  const actual = await load<typeof import('@nestjs/config')>();
  configure.mockResolvedValue({ module: actual.ConfigModule });
  return { ...actual, ConfigModule: { forRoot: configure } };
});

it('loads environment files from the worker package before workspace defaults', () => {
  expect(configure.mock.calls[0]?.[0].envFilePath?.slice(0, 2)).toEqual([
    resolve(import.meta.dirname, '../.env.local'),
    resolve(import.meta.dirname, '../.env'),
  ]);
});
