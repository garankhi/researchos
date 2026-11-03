import { z } from 'zod';

/**
 * The validation schema of the login form.
 *
 * The messages are **codes**, not sentences. The catalog holds the wording,
 * under `errors.codes.fields`, so the same code means the same thing whether
 * the failure came from this schema or from the server.
 *
 * The codes are the ones the backend's `LoginDto` raises, so the two
 * statements of the same rule cannot drift apart silently:
 *
 * | Field | Backend decorator | This schema |
 * | --- | --- | --- |
 * | `email` | `@IsEmail({ message: 'email_invalid' })` | `email_invalid` |
 * | `email` | `@MaxLength(255, { message: 'email_too_long' })` | `email_too_long` |
 * | `password` | `@MinLength(1, { message: 'password_required' })` | `password_required` |
 * | `password` | `@MaxLength(1024, { message: 'password_too_long' })` | `password_too_long` |
 *
 * `email_required` is the frontend's own addition: an empty field never
 * reaches the server, so the code exists only here.
 */

/**
 * A deliberately simple email shape.
 *
 * It is not a full RFC 5322 parser — the server owns that check, and it
 * sends `email_invalid` back when the address does not satisfy it. This
 * only catches the obvious mistakes before the request is made.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The login form's values.
 */
export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'email_required')
    .max(255, 'email_too_long')
    .refine((value) => EMAIL_PATTERN.test(value), 'email_invalid'),
  password: z
    .string()
    .min(1, 'password_required')
    .max(1024, 'password_too_long'),
});

/**
 * The values the login form holds.
 */
export type LoginFormValues = z.infer<typeof loginFormSchema>;
