import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd });

describe('form-control-must-be-wired', () => {
  it.each([
    ['native input with only a name', '<Input name="status" />', 'notWired'],
    ['namespaced input', '<Chakra.Input />', 'notWired'],
    ['native registration', '<Input {...register("status")} />', undefined],
    [
      'compound select with native registration',
      '<Select.Root {...register("status")} />',
      'missingCompoundBinding',
    ],
    [
      'aliased select with a plain Controller spread',
      '<ChakraSelect.Root {...field} />',
      'missingCompoundBinding',
    ],
    [
      'namespaced select with an adapted callback',
      '<Chakra.Select.Root value={field.value} onValueChange={({ value }) => field.onChange(value)} />',
      undefined,
    ],
    [
      'checkbox with an adapted callback',
      '<Checkbox.Root checked={field.value} onCheckedChange={({ checked }) => field.onChange(checked)} />',
      undefined,
    ],
  ])('%s', async (_name, element, expectedMessage) => {
    const [result] = await eslint.lintText(
      `
        import { Controller, useForm } from 'react-hook-form';
        import { Checkbox, Input, Select, Select as ChakraSelect } from '@chakra-ui/react';
        import * as Chakra from '@chakra-ui/react';

        export function TestForm() {
          const { register, control, handleSubmit } = useForm();
          return (
            <form onSubmit={handleSubmit(() => {})}>
              <Controller name="status" control={control} render={({ field }) => ${element}} />
            </form>
          );
        }
      `,
      { filePath: 'src/example-form.tsx' },
    );

    expect(result.fatalErrorCount).toBe(0);
    const messages = result.messages
      .filter(
        ({ ruleId }) => ruleId === 'researchosForms/form-control-must-be-wired',
      )
      .map(({ messageId }) => messageId);
    expect(messages).toEqual(expectedMessage ? [expectedMessage] : []);
  });
});
