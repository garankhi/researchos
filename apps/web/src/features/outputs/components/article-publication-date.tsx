import { useId } from 'react';
import {
  Box,
  Fieldset,
  Grid,
  Input,
  NativeSelect,
  Text,
} from '@chakra-ui/react';
import { useFormatter, useTranslations } from 'next-intl';
import { useController, useFormContext } from 'react-hook-form';
import type { ArticleBasics } from './article-basics';

export function ArticlePublicationDate({ onEdit }: { onEdit?: () => void }) {
  const { control } = useFormContext<ArticleBasics>();
  const { field, fieldState } = useController({
    control,
    name: 'publicationDate',
  });
  const t = useTranslations('articleBasics');
  const format = useFormatter();
  const id = useId();
  const [year = '', month = '', day = ''] = field.value.split('-');
  function change(parts: string[]) {
    // Keep empty leading parts while editing so day and month can be entered first.
    onEdit?.();
    field.onChange(parts.join('-').replace(/-+$/, ''));
  }
  return (
    <Fieldset.Root invalid={fieldState.invalid}>
      <Fieldset.Legend>{t('date')}</Fieldset.Legend>
      <Grid gap="2" templateColumns="repeat(3,minmax(0,1fr))">
        {(['day', 'month'] as const).map((part) => (
          <Box key={part}>
            <Text asChild textStyle="sm" fontWeight="medium" mb="1.5">
              <label htmlFor={id + part}>{t(part)}</label>
            </Text>
            <NativeSelect.Root variant="subtle">
              <NativeSelect.Field
                id={id + part}
                value={part === 'day' ? day : month}
                onBlur={field.onBlur}
                onChange={(event) =>
                  change(
                    part === 'day'
                      ? [year, month, event.target.value]
                      : [year, event.target.value, day],
                  )
                }
              >
                <option value="">—</option>
                {Array.from(
                  { length: part === 'day' ? 31 : 12 },
                  (_, index) => (
                    <option
                      key={index}
                      value={String(index + 1).padStart(2, '0')}
                    >
                      {part === 'day'
                        ? index + 1
                        : format.dateTime(new Date(Date.UTC(2000, index, 1)), {
                            month: 'short',
                            timeZone: 'UTC',
                          })}
                    </option>
                  ),
                )}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
        ))}
        <Box>
          <Text asChild textStyle="sm" fontWeight="medium" mb="1.5">
            <label htmlFor={id + 'year'}>{t('year')}</label>
          </Text>
          <Input
            id={id + 'year'}
            ref={(el) => field.ref(el)}
            value={year}
            required
            aria-invalid={fieldState.invalid}
            aria-describedby={id + 'hint'}
            inputMode="numeric"
            maxLength={4}
            placeholder="2026"
            variant="subtle"
            onBlur={field.onBlur}
            onChange={(event) =>
              change([event.target.value.replace(/\D/g, ''), month, day])
            }
          />
        </Box>
      </Grid>
      <Text
        id={id + 'hint'}
        fontSize="sm"
        color={fieldState.invalid ? 'fg.error' : 'fg.muted'}
        role={fieldState.invalid ? 'alert' : undefined}
      >
        {t(fieldState.invalid ? 'dateInvalid' : 'dateHint')}
      </Text>
    </Fieldset.Root>
  );
}
