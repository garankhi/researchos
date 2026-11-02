// Sets up a working copy of ResearchOS on a new machine.
//
// The script runs every step that is needed before the apps can start, in the
// order they depend on each other:
//
//   1. `.env`         — created from `.env.example` when it is missing.
//   2. install        — the workspace dependencies.
//   3. infrastructure — PostgreSQL and Redis, through Docker Compose.
//   4. database       — the database, the migrations and the seed data.
//   5. build          — the compiled output of every workspace package.
//   6. codegen        — the OpenAPI document and the Orval client for the web.
//
// Usage from the repository root:
//   pnpm setup
//
// Every step is skipped when it has already been done, so the command can be
// run again on a machine that is already set up.
//
// Optional environment variables:
//   SETUP_SKIP_INSTALL=1   Do not run `pnpm install`.
//   SETUP_SKIP_INFRA=1     Do not run `pnpm infra:up`.
//
// The script is plain Node, so that it runs the same way on every machine.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The environment file the workspace reads.
 */
const ENV_PATH = resolve(workspaceRoot, '.env');

/**
 * The template the environment file is created from.
 */
const ENV_EXAMPLE_PATH = resolve(workspaceRoot, '.env.example');

/**
 * Writes a line to stdout.
 */
function log(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * Runs a command and ends the run when it fails.
 *
 * The command runs in the workspace root, so that the workspace scripts
 * resolve the same way they do when they are typed by hand.
 */
function run(label, command, args, options = {}) {
  log('');
  log(`==> ${label}`);
  log(`    $ ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.stderr.write(`\nThe step failed: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

/**
 * Creates the environment file when it is missing.
 *
 * The file is copied from the template, not generated, so that the defaults
 * in the template stay the single source of truth. The values in it are the
 * local development ones, which match the Docker stack.
 */
function ensureEnvFile() {
  if (existsSync(ENV_PATH)) {
    log('    .env already exists, keeping it.');
    return;
  }

  if (!existsSync(ENV_EXAMPLE_PATH)) {
    process.stderr.write('\nThe file .env.example is missing, so .env cannot be created.\n');
    process.exit(1);
  }

  copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  log('    Created .env from .env.example. Review it if you need other values.');
}

/**
 * Runs the steps of the setup, in order.
 */
function main() {
  log('ResearchOS setup');

  ensureEnvFile();

  if (process.env.SETUP_SKIP_INSTALL === '1') {
    log('');
    log('==> install (skipped)');
  } else {
    run('install', 'pnpm', ['install', '--frozen-lockfile']);
  }

  if (process.env.SETUP_SKIP_INFRA === '1') {
    log('');
    log('==> infrastructure (skipped)');
  } else {
    run('infrastructure', 'pnpm', ['run', 'infra:up']);
  }

  // The database step creates the development accounts as well, so that a
  // local copy is usable without a separate sign-in step.
  run('database', 'pnpm', ['run', 'db:setup']);

  run('build', 'pnpm', ['run', 'build']);
  run('codegen', 'pnpm', ['run', 'codegen']);

  log('');
  log('The setup is complete.');
  log('');
  log('Start the apps with:');
  log('');
  log('  pnpm dev');
  log('');
  log('The worker runs separately, in another terminal:');
  log('');
  log('  pnpm dev:worker');
}

main();
