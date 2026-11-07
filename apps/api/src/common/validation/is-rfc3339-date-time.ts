import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

/**
 * The RFC 3339 `date-time` production.
 *
 * The grammar is deliberately narrow: a calendar date, a `T` separator, a
 * wall-clock time, and a mandatory offset (`Z` or `±HH:MM`). A date without
 * an offset is not a point in time — it would be read in the server's
 * timezone — and the OpenAPI `date-time` format does not allow it either.
 *
 * The week-date (`2026-W45-7`) and basic (`20261107`) forms of ISO 8601 are
 * deliberately absent. They are valid ISO 8601 but not valid RFC 3339, and
 * JavaScript cannot parse them into a `Date` at all.
 */
const RFC3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

/**
 * The number of days in a month, with the leap year applied.
 *
 * The leap year is computed by hand rather than through `Date.UTC`,
 * because `Date.UTC` maps the years 0 to 99 onto 1900 to 1999 and would
 * give the wrong answer for a two-digit year.
 */
function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  return month === 2 && isLeap ? 29 : lengths[month - 1];
}

/**
 * Whether a value is an RFC 3339 date-time that names a real instant.
 *
 * Three things have to hold at once, and each one rules out a family of
 * values that a looser check would accept:
 *
 * 1. The value matches the RFC 3339 `date-time` grammar. This rejects the
 *    ISO 8601 week dates and basic formats, which carry no offset and are
 *    not instants.
 * 2. The components name a real calendar moment. `2026-02-30` is a
 *    well-formed string but not a date, and JavaScript silently rolls it
 *    over to the 2nd of March.
 * 3. JavaScript can turn it into a `Date`. A value that reaches the
 *    database layer without a valid `Date` fails the Prisma client with a
 *    validation error, which is a 500 rather than the 400 the caller
 *    deserves.
 */
export function isRfc3339DateTime(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const match = RFC3339_DATE_TIME.exec(value);
  if (!match) return false;

  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] =
    match;

  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return false;

  const dayNumber = Number(day);
  if (dayNumber < 1 || dayNumber > daysInMonth(Number(year), monthNumber))
    return false;

  if (Number(hour) > 23) return false;
  if (Number(minute) > 59) return false;
  // A leap second is 60, but it has no representation in a `Date`.
  if (Number(second) > 59) return false;

  if (offsetHour !== undefined) {
    if (Number(offsetHour) > 23) return false;
    if (Number(offsetMinute) > 59) return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Validates a property as an RFC 3339 date-time with a timezone offset.
 *
 * The built-in `@IsISO8601({ strict: true })` accepts every ISO 8601
 * form, including the week dates and the basic format. Those pass
 * validation and then fail deeper in the stack, where the caller gets a
 * server error instead of a rejected request. This decorator accepts only
 * the instants the API can actually store.
 *
 * The `message` is a catalog code, like every other validation message.
 *
 * ```typescript
 * @IsRfc3339DateTime({ message: 'application_deadline_invalid' })
 * applicationDeadline?: string | null;
 * ```
 */
export function IsRfc3339DateTime(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isRfc3339DateTime',
      validator: {
        validate: (value: unknown): boolean => isRfc3339DateTime(value),
        defaultMessage: buildMessage(
          (eachPrefix: string) =>
            `${eachPrefix}$property must be an RFC 3339 date-time with a timezone offset`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
