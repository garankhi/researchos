import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Resolves the environment files for a package in this workspace.
 *
 * The problem this solves: `@nestjs/config` resolves `envFilePath` relative
 * to `process.cwd()`. Under Turborepo the cwd of `apps/api` is the app
 * directory, so a workspace-root `.env` is never found and the app starts
 * without `DATABASE_URL`.
 *
 * The convention in this workspace is:
 * - The **root** `.env` holds the variables shared by every package
 *   (`DATABASE_URL`, `WEB_ORIGIN`, ...).
 * - A **package-local** `.env` may override them for that package only.
 *
 * Real environment variables always win over both files, so a container can
 * override anything without touching a file.
 */

/**
 * Walks up from the given directory until it finds the workspace root, which
 * is the directory that holds `pnpm-workspace.yaml`.
 */
function findWorkspaceRoot(startDir: string): string | undefined {
  let current = resolve(startDir);

  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

/**
 * Returns the environment files to load, ordered so that the **first** entry
 * has the highest priority.
 *
 * `@nestjs/config` merges the files in order and lets the earlier file win,
 * so the package-local file comes first and the workspace root comes last.
 *
 * `packageRoot` is the directory of the package that owns the app, for
 * example `apps/api`. Use `resolve(import.meta.dirname, '..')` from a file
 * that sits one level below the package root.
 */
export function resolveEnvFilePaths(packageRoot: string): string[] {
  const paths: string[] = [];
  const root = resolve(packageRoot);

  // Package-local overrides, in the order NestJS itself prefers.
  paths.push(resolve(root, '.env.local'));
  paths.push(resolve(root, '.env'));

  const workspaceRoot = findWorkspaceRoot(root);
  if (workspaceRoot && workspaceRoot !== root) {
    paths.push(resolve(workspaceRoot, '.env'));
  }

  // The package-local paths are kept even when the file is missing, so that
  // a missing file is not treated as an error by the caller.
  return paths.filter((path, index) => index < 2 || existsSync(path));
}
