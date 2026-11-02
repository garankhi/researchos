// The development accounts that local login needs.
//
// The FPTU SSO protocol is not settled yet, so the local login path is the
// only way to sign in during development. That needs accounts to sign in
// with, which is what this creates.
//
// This is a module, not a command. The taxonomy seeds call it, so that
// `pnpm db:seed` and `pnpm db:seed:online` both seed the accounts.
//
// The accounts are development-only fixtures. They share one known password,
// so they only make sense on a local machine.
//
// `user_sessions` is deliberately not seeded. A session has to be issued by
// the login endpoint, because only the endpoint knows the raw token, and the
// database only ever stores its hash.
import { hash } from '@node-rs/argon2';
import { log } from './openalex.mjs';

/**
 * The password of the development accounts.
 *
 * It is a placeholder, not a secret. It only has to be changed before an
 * account is used for anything that matters, which is why the accounts are
 * seeded with `must_change_password` turned off only in the local
 * development setup.
 */
const DEFAULT_PASSWORD = 'ResearchOS!Dev2026';

/**
 * The development accounts.
 *
 * The mix mirrors the roles the application has to be developed against:
 * an admin who can reach the administration endpoints, a researcher who can
 * create content, and a guest who can only read what is public.
 *
 * `user_type` decides the baseline access on its own. A `FACULTY` account is
 * a researcher without any role assignment, a `STAFF` account starts as a
 * guest, and a `STUDENT` account starts as a guest too.
 */
const DEV_USERS = [
  {
    email: 'admin@researchos.local',
    full_name: 'Dev Admin',
    user_type: 'STAFF',
    academic_title: null,
    academic_degree: null,
    department_unit: 'FPTU',
    roles: ['ADMIN', 'RESEARCHER'],
  },
  {
    email: 'faculty@researchos.local',
    full_name: 'Dev Faculty',
    user_type: 'FACULTY',
    academic_title: 'PGS',
    academic_degree: 'TS',
    department_unit: 'FPTU',
    // A faculty account is a researcher through the baseline rule in
    // `effective_user_access`, so it needs no role assignment.
    roles: [],
  },
  {
    email: 'student@researchos.local',
    full_name: 'Dev Student',
    user_type: 'STUDENT',
    academic_title: null,
    academic_degree: null,
    department_unit: 'FPTU',
    roles: ['RESEARCHER'],
  },
  {
    email: 'guest@researchos.local',
    full_name: 'Dev Guest',
    user_type: 'STAFF',
    academic_title: null,
    academic_degree: null,
    department_unit: 'FPTU',
    roles: [],
  },
];

/**
 * Seeds the development accounts.
 *
 * The seed is idempotent. An account that already exists keeps its id and
 * its roles; only the credentials are refreshed, so that a changed password
 * takes effect on the next run.
 */
export async function seedUsers(prisma) {
  const password = DEFAULT_PASSWORD;
  const passwordHash = await hash(password);

  for (const devUser of DEV_USERS) {
    // The email is the identity of an account. The schema has no `@unique`
    // on it, because the uniqueness is a case-insensitive expression index
    // that Prisma cannot express. The lookup therefore uses `findFirst`.
    const existing = await prisma.users.findFirst({
      where: { email: devUser.email },
    });

    const user = existing
      ? await prisma.users.update({
          where: { id: existing.id },
          data: {
            full_name: devUser.full_name,
            user_type: devUser.user_type,
            academic_title: devUser.academic_title,
            academic_degree: devUser.academic_degree,
            department_unit: devUser.department_unit,
            is_active: true,
          },
        })
      : await prisma.users.create({
          data: {
            email: devUser.email,
            full_name: devUser.full_name,
            user_type: devUser.user_type,
            academic_title: devUser.academic_title,
            academic_degree: devUser.academic_degree,
            department_unit: devUser.department_unit,
            is_active: true,
          },
        });

    // The credential is refreshed on every run, so that a rotated
    // password takes effect without a manual step. The trigger
    // `stamp_password_change` stamps the change time, and the trigger
    // `revoke_password_sessions` revokes the sessions of the account.
    await prisma.local_credentials.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        password_hash: passwordHash,
        must_change_password: false,
      },
      update: {
        password_hash: passwordHash,
        must_change_password: false,
      },
    });

    for (const role of devUser.roles) {
      // The roles are granted by the system, so `granted_by` stays NULL.
      // The check `ck_grant_source_actor` requires exactly that pairing.
      //
      // The uniqueness of a grant is a partial index on
      // `(user_id, role) WHERE revoked_at IS NULL`, so a revoked grant does
      // not block a new one. An `upsert` cannot be used here, because the
      // index is partial and Prisma would generate an `ON CONFLICT` clause
      // that does not match it. The unrevoked grant is therefore looked up
      // directly, and a new grant is inserted when there is none.
      const active = await prisma.user_role_assignments.findFirst({
        where: { user_id: user.id, role, revoked_at: null },
      });

      if (!active) {
        await prisma.user_role_assignments.create({
          data: {
            user_id: user.id,
            role,
            grant_source: 'SYSTEM',
            granted_by: null,
            reason: 'Development seed account',
          },
        });
      }
    }

    log(
      `  ${devUser.email.padEnd(28)} ${devUser.user_type.padEnd(8)} ` +
        `${devUser.roles.join(',') || 'no role'}`,
    );
  }
}

/**
 * Seeds the development accounts and reports the counts.
 *
 * The accounts are always created. They are development fixtures, so the
 * seed is only ever run against a local database.
 */
export async function seedDevUsers(prisma) {
  log('');
  log('Seeding the development accounts ...');

  await seedUsers(prisma);

  const [users, credentials, grants] = await Promise.all([
    prisma.users.count(),
    prisma.local_credentials.count(),
    prisma.user_role_assignments.count(),
  ]);

  log(`  users                ${users}`);
  log(`  local_credentials     ${credentials}`);
  log(`  user_role_assignments ${grants}`);
}
