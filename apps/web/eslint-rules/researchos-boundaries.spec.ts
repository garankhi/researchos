import { Linter, type ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { researchosBoundaryPlugin } from './researchos-boundaries.mjs';

const linter = new Linter();

describe('cross-feature public interfaces', () => {
  it.each([
    ['@/features/identity', false],
    ['@/features/identity/index.ts', false],
    ['../identity', false],
    ['@/features/identity/hooks/use-session', true],
    ['../identity/store/session-store', true],
    ['@/features/groups/hooks/use-group-hub', false],
  ])('checks %s', (source, rejected) => {
    const messages = linter.verify(
      `import { useSession } from '${source}'; export { useSession };`,
      [
        {
          files: ['**/*.ts'],
          plugins: {
            researchos: researchosBoundaryPlugin as unknown as ESLint.Plugin,
          },
          rules: { 'researchos/no-cross-feature-imports': 'error' },
        },
      ],
      { filename: 'src/features/groups/example.ts' },
    );
    expect(messages.some((message) => message.fatal)).toBe(false);
    expect(
      messages.filter(
        (message) => message.ruleId === 'researchos/no-cross-feature-imports',
      ),
    ).toHaveLength(rejected ? 1 : 0);
  });
});
