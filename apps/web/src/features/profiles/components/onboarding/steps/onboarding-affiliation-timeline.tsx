'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Field,
  Flex,
  IconButton,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  OnboardingAffiliationDto,
  OnboardingAffiliationDtoInstitutionType,
} from '@/lib/api/models';
import {
  AFFILIATION_MAX_YEAR,
  AFFILIATION_MIN_YEAR,
  affiliationRowProblem,
  affiliationYear,
  isStorableAffiliation,
  openAlexInstitutionType,
  sameAffiliationValues,
} from '../../../schemas/onboarding-affiliation.schema';
import { resolveErrorCode } from '@/utils/error-messages';

/**
 * The props of the affiliation timeline.
 */
export interface OnboardingAffiliationTimelineProps {
  /**
   * The affiliations OpenAlex reports for the confirmed author.
   *
   * The shape is the draft's, not the API's: the draft holds OpenAlex's
   * own wording for the institution kind, and the row maps it onto the
   * platform's enum as it is edited.
   */
  affiliations: ReadonlyArray<{
    institutionId: string;
    name: string;
    ror?: string | null;
    countryCode?: string | null;
    institutionType?: string | null;
    yearStart?: number | null;
    yearEnd?: number | null;
  }>;
  /**
   * The timeline the researcher edited, or null when they never touched
   * it.
   *
   * Null is not the same as an empty list: null means "the researcher
   * left it alone", and the finalize call then says nothing about the
   * affiliations, so the rows the OpenAlex sync wrote stay as they
   * are.
   */
  values: OnboardingAffiliationDto[] | null;
  /** Records the edited timeline. */
  onChange: (values: OnboardingAffiliationDto[] | null) => void;
}

/**
 * One affiliation, as it is being edited.
 *
 * The years are strings here, not numbers: an input holds text, and
 * "the year is unknown" is an empty field rather than a null. The
 * conversion to the API's shape happens when the row leaves the
 * component.
 */
interface AffiliationRow {
  /** The key the row is stored under. */
  institutionId: string;
  /** The institution name, as the researcher spelled it. */
  name: string;
  /** The ROR id of the institution, when it has one. */
  ror: string | null;
  /** The ISO country code of the institution. */
  countryCode: string | null;
  /** The kind of institution. */
  institutionType: OnboardingAffiliationDtoInstitutionType;
  /** The first year the affiliation held. Empty means unknown. */
  yearStart: string;
  /** The last year the affiliation held. Empty means still running. */
  yearEnd: string;
}

/**
 * The id of an affiliation the researcher added by hand.
 *
 * The backend keys the affiliations on the institution id, and the
 * unique constraint sits on `(user_id, institution_id)`. A hand-added
 * affiliation has no OpenAlex id, so it gets a synthetic one that is
 * unique by construction: two rows can never collide, and the
 * constraint cannot be violated by a researcher who added the same
 * institution twice.
 *
 * The prefix marks the id as synthetic, so a reader of the database
 * can tell a real OpenAlex id from a generated one — and so the UI can
 * hide the id, which means nothing to a researcher.
 */
function manualInstitutionId(): string {
  return `manual-${crypto.randomUUID()}`;
}

/**
 * Whether an id was generated rather than reported by OpenAlex.
 */
function isManualId(institutionId: string): boolean {
  return institutionId.startsWith('manual-');
}

/**
 * An OpenAlex affiliation, as an editable row.
 */
function toRow(affiliation: {
  institutionId: string;
  name: string;
  ror?: string | null;
  countryCode?: string | null;
  institutionType?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
}): AffiliationRow {
  return {
    institutionId: affiliation.institutionId,
    name: affiliation.name,
    ror: affiliation.ror ?? null,
    countryCode: affiliation.countryCode ?? null,
    institutionType: openAlexInstitutionType(affiliation.institutionType),
    yearStart:
      affiliation.yearStart == null ? '' : String(affiliation.yearStart),
    yearEnd: affiliation.yearEnd == null ? '' : String(affiliation.yearEnd),
  };
}

/**
 * An editable row, in the API's shape.
 *
 * The institution id is carried through untouched: it is the key the
 * row is stored under, and correcting the institution's *name* must not
 * change its identity.
 */
function toValue(row: AffiliationRow): OnboardingAffiliationDto {
  return {
    institutionId: row.institutionId,
    name: row.name.trim(),
    ror: row.ror,
    countryCode: row.countryCode,
    institutionType: row.institutionType,
    yearStart: affiliationYear(row.yearStart),
    yearEnd: affiliationYear(row.yearEnd),
  };
}

/**
 * The affiliation timeline the researcher edits.
 *
 * ## What is editable and why
 *
 * The timeline is the one part of the OpenAlex record that is the
 * researcher's own business: "where I was and until when" is their
 * career, and OpenAlex regularly gets it wrong. It reports the
 * institution of the latest *authorship*, which for a researcher who
 * has moved is the one they left.
 *
 * The counts, the byline spellings and the topics stay read-only: they
 * are OpenAlex's, and the platform does not own them.
 *
 * ## Why the institution id is hidden
 *
 * The id is the key the row is stored under, and the researcher has no
 * way of knowing it. An affiliation that came from OpenAlex keeps its
 * id for good — correcting the name does not change the identity. One
 * the researcher adds gets a synthetic id generated once, so the
 * backend's unique constraint cannot be tripped by adding the same
 * institution twice.
 *
 * ## Why an unfinished row is not saved
 *
 * The backend refuses a row without a name, and refuses a row whose
 * end year precedes its start year. It refuses the *whole* payload
 * when it refuses a row, so a half-typed affiliation would block the
 * whole onboarding. Such a row is therefore left out of what is sent,
 * and the researcher is told that it is not saved yet.
 */
export function OnboardingAffiliationTimeline({
  affiliations,
  values,
  onChange,
}: OnboardingAffiliationTimelineProps) {
  const t = useTranslations('onboarding.profileStep.affiliations');
  const tErrors = useTranslations('errors');
  const fieldId = useId();

  /*
   * The rows the researcher is editing.
   *
   * The edited timeline wins over the one OpenAlex reports: the
   * researcher may have come back to the step, and their corrections
   * are still theirs. The state is seeded once, because the component
   * is remounted when the confirmed author changes — that is the only
   * thing that should reset the timeline.
   */
  const [rows, setRows] = useState<AffiliationRow[]>(() =>
    (values ?? affiliations).map((affiliation) => toRow(affiliation)),
  );

  /*
   * The values the last publish sent.
   *
   * They are the baseline: a timeline that still equals the one the
   * editor started with has not been edited, and the finalize call
   * then says nothing about the affiliations at all — which is what
   * leaves the rows the OpenAlex sync wrote exactly as they are.
   */
  const published = useRef<OnboardingAffiliationDto[]>(
    (values ?? affiliations)
      .map((affiliation) => toRow(affiliation))
      .map(toValue),
  );

  /*
   * The pending publish.
   *
   * The recording is debounced rather than immediate: a keystroke in a
   * name field would otherwise write the whole timeline into the draft
   * on every character, and every write is a store update the whole
   * flow re-renders for.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<OnboardingAffiliationDto[] | null>(null);

  /*
   * The callback is kept in an effect rather than in a ref that is
   * written during render: writing a ref during render is what the
   * lint rule objects to, and the effect gives the same guarantee — the
   * flush always calls the current callback.
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const publish = (next: OnboardingAffiliationDto[]) => {
    pending.current = next;
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      const due = pending.current;
      pending.current = null;
      if (due !== null && !sameAffiliationValues(due, published.current)) {
        published.current = due;
        onChangeRef.current(due);
      }
    }, 300);
  };

  /*
   * The flush on the way out.
   *
   * The step unmounts when the researcher moves to another one, and a
   * pending write would be dropped with it — the researcher would come
   * back to a timeline that lost their last edit. So the pending write
   * is flushed when the editor goes away.
   */
  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const due = pending.current;
      pending.current = null;
      if (due !== null && !sameAffiliationValues(due, published.current)) {
        published.current = due;
        onChangeRef.current(due);
      }
    };
  }, []);

  const updateRow = (index: number, patch: Partial<AffiliationRow>) => {
    const next = rows.map((row, position) =>
      position === index ? { ...row, ...patch } : row,
    );
    setRows(next);
    publish(next.filter((row) => isStorableAffiliation(row)).map(toValue));
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, position) => position !== index);
    setRows(next);
    publish(next.filter((row) => isStorableAffiliation(row)).map(toValue));
  };

  const addRow = () => {
    const next = [
      ...rows,
      {
        institutionId: manualInstitutionId(),
        name: '',
        ror: null,
        countryCode: null,
        institutionType: null,
        yearStart: '',
        yearEnd: '',
      },
    ];
    setRows(next);
    /*
     * A row without a name cannot be stored, so it is not published.
     * It appears in the timeline as soon as the researcher gives it a
     * name.
     */
    publish(next.filter((row) => isStorableAffiliation(row)).map(toValue));
  };

  const problems = useMemo(
    () => rows.map((row) => affiliationRowProblem(row)),
    [rows],
  );

  const hasProblems = problems.some((problem) => problem !== null);

  return (
    <Stack gap="4">
      <Box>
        <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="1">
          {t('title')}
        </Text>
        <Text textStyle="sm" color="fg.muted">
          {t('description')}
        </Text>
      </Box>

      {rows.length === 0 ? (
        <Text textStyle="sm" color="fg.muted">
          {t('empty')}
        </Text>
      ) : null}

      <Stack gap="3">
        {rows.map((row, index) => {
          const problem = problems[index];
          const isRunning = row.yearEnd.trim() === '';

          return (
            <Box
              key={row.institutionId}
              bg="bg.subtle"
              p="3"
              borderWidth="1px"
              borderColor={problem ? 'border.error' : 'border.emphasized'}
            >
              <Stack gap="2">
                <Flex gap="2" align="center">
                  <Field.Root
                    invalid={problem === 'affiliation_name_required'}
                    flex="1"
                    minW="0"
                  >
                    <Field.Label htmlFor={`${fieldId}-name-${index}`}>
                      {t('institution')}
                    </Field.Label>
                    <Input
                      id={`${fieldId}-name-${index}`}
                      variant="subtle"
                      value={row.name}
                      placeholder={t('institutionPlaceholder')}
                      onChange={(event) =>
                        updateRow(index, { name: event.target.value })
                      }
                    />
                  </Field.Root>
                  <IconButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    colorPalette="red"
                    alignSelf="flex-end"
                    aria-label={t('remove')}
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 />
                  </IconButton>
                </Flex>

                <Flex gap="2" align="flex-end" flexWrap="wrap">
                  <Field.Root flex="1" minW="6rem">
                    <Field.Label htmlFor={`${fieldId}-start-${index}`}>
                      {t('yearFrom')}
                    </Field.Label>
                    <Input
                      id={`${fieldId}-start-${index}`}
                      variant="subtle"
                      type="number"
                      inputMode="numeric"
                      min={AFFILIATION_MIN_YEAR}
                      max={AFFILIATION_MAX_YEAR}
                      value={row.yearStart}
                      placeholder={t('yearFromPlaceholder')}
                      onChange={(event) =>
                        updateRow(index, { yearStart: event.target.value })
                      }
                    />
                  </Field.Root>

                  <Text textStyle="sm" color="fg.muted" pb="2">
                    –
                  </Text>

                  <Field.Root flex="1" minW="6rem">
                    <Field.Label htmlFor={`${fieldId}-end-${index}`}>
                      {t('yearTo')}
                    </Field.Label>
                    <Input
                      id={`${fieldId}-end-${index}`}
                      variant="subtle"
                      type="number"
                      inputMode="numeric"
                      min={AFFILIATION_MIN_YEAR}
                      max={AFFILIATION_MAX_YEAR}
                      value={row.yearEnd}
                      placeholder={t('yearToPlaceholder')}
                      onChange={(event) =>
                        updateRow(index, { yearEnd: event.target.value })
                      }
                    />
                  </Field.Root>

                  {isRunning ? (
                    <Badge colorPalette="green" size="sm" pb="2">
                      {t('current')}
                    </Badge>
                  ) : null}
                </Flex>

                {problem ? (
                  <Text textStyle="xs" color="fg.error">
                    {resolveErrorCode(tErrors, problem, tErrors('unknown'))}
                  </Text>
                ) : null}

                {/*
                 * The institution id of a row that came from OpenAlex.
                 *
                 * It is shown so the researcher can see that the row is
                 * still the same institution after a correction of the
                 * name. A row the researcher added has a synthetic id
                 * that means nothing to them, so it is not shown.
                 */}
                {!isManualId(row.institutionId) ? (
                  <Text textStyle="xs" color="fg.muted">
                    {t('institutionIdLabel', { id: row.institutionId })}
                  </Text>
                ) : null}
              </Stack>
            </Box>
          );
        })}
      </Stack>

      <Flex justify="flex-end">
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          <Plus />
          {t('add')}
        </Button>
      </Flex>

      {hasProblems ? (
        <Text textStyle="xs" color="fg.error">
          {t('invalidSummary')}
        </Text>
      ) : null}
    </Stack>
  );
}
