import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveEnvFilePaths } from './env-paths.js';

describe('resolveEnvFilePaths', () => {
  let workspace: string;
  let appDir: string;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'researchos-config-'));
    mkdirSync(join(workspace, 'apps', 'api'), { recursive: true });
    writeFileSync(join(workspace, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    writeFileSync(join(workspace, '.env'), 'DATABASE_URL="postgresql://root/db"\n');
    writeFileSync(join(workspace, 'apps', 'api', '.env'), 'PORT=4000\n');
    appDir = join(workspace, 'apps', 'api');
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('should put the package-local files before the workspace root file', () => {
    const paths = resolveEnvFilePaths(appDir);

    expect(paths[0]).toBe(resolve(appDir, '.env.local'));
    expect(paths[1]).toBe(resolve(appDir, '.env'));
    expect(paths[2]).toBe(resolve(workspace, '.env'));
  });

  it('should find the workspace root by walking up', () => {
    const nested = join(appDir, 'src', 'modules');

    const paths = resolveEnvFilePaths(nested);

    expect(paths).toContain(resolve(workspace, '.env'));
  });

  it('should keep the package-local paths even when the files do not exist', () => {
    const paths = resolveEnvFilePaths(join(workspace, 'apps', 'worker'));

    expect(paths[0]).toBe(resolve(workspace, 'apps', 'worker', '.env.local'));
    expect(paths[1]).toBe(resolve(workspace, 'apps', 'worker', '.env'));
  });

  it('should not duplicate the root file when the package is the workspace root', () => {
    const paths = resolveEnvFilePaths(workspace);

    expect(paths.filter((path) => path === resolve(workspace, '.env'))).toHaveLength(1);
  });
});
