/**
 * Identity feature — public entry point.
 *
 * This barrel is the only import surface other modules should use. Import
 * from `@/features/identity` rather than reaching into the subfolders, so the
 * internal layout can change without rippling through the app.
 */

export { AccountMenu } from './components/account-menu';
export { AccountSlot } from './components/account-slot';
export { LoginForm } from './components/login-form';
export { RequireAuth } from './components/require-auth';
export { SessionSummary } from './components/session-summary';
export { useLogin } from './hooks/use-login';
export { useLogout } from './hooks/use-logout';
export { useMe } from './hooks/use-me';
export { useSession } from './hooks/use-session';
export { useCurrentUser } from './hooks/use-session';
export { loginFormSchema } from './schemas/login-form.schema';
export type { LoginFormValues } from './schemas/login-form.schema';
export { initialsOf } from './utils/initials';
export {
  DEFAULT_RETURN_TO,
  RETURN_TO_PARAM,
  buildLoginHref,
  isSafeReturnTo,
  resolveReturnTo,
} from './utils/return-to';
export type { CurrentUser, LoginCredentials } from './types';
