// Explicit opt-in integration check. Creates and drops only its own scratch DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireDatabase = createRequire(
  import.meta.resolve('@researchos/database'),
);
const { Client } = requireDatabase('pg');
const input = process.env.RES159_TEST_POSTGRES_URL;
if (!input)
  throw new Error(
    'Set RES159_TEST_POSTGRES_URL to a loopback PostgreSQL maintenance database named postgres. No existing application database is used.',
  );
const maintenanceUrl = new URL(input);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(maintenanceUrl.hostname) ||
  maintenanceUrl.pathname !== '/postgres'
)
  throw new Error(
    'Only a loopback URL with database name postgres is allowed.',
  );

const name = `res159_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(maintenanceUrl);
testUrl.pathname = `/${name}`;
const admin = new Client({ connectionString: maintenanceUrl.href });
const db = new Client({ connectionString: testUrl.href });
let created = false;
let checks = 0;
const check = async (label, run) => {
  await run();
  checks++;
  console.log(`PASS ${label}`);
};
const ids = Object.fromEntries(
  [
    'lead',
    'projectLead',
    'delegated',
    'creator',
    'group',
    'project',
    'direction',
    'groupOpportunity',
    'projectOpportunity',
  ].map((key) => [key, randomUUID()]),
);
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await db.connect();
  const migrations = new URL(
    '../../../packages/database/prisma/migrations/',
    import.meta.url,
  );
  const upgrade = '20261115120000_group_hub_soft_delete';
  for (const entry of (await readdir(migrations, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name >= upgrade) continue;
    await db.query(
      await readFile(
        new URL(`${entry.name}/migration.sql`, migrations),
        'utf8',
      ),
    );
  }
  for (const person of ['lead', 'projectLead', 'delegated', 'creator']) {
    await db.query(
      `INSERT INTO users (id,user_type,email,full_name,department_unit) VALUES ($1,'FACULTY',$2,$3,'Computing')`,
      [ids[person], `${person}@example.test`, person],
    );
  }
  await db.query(
    `INSERT INTO research_groups (id,code,name,lead_id) VALUES ($1,'RES159','Scratch group',$2)`,
    [ids.group, ids.lead],
  );
  await db.query(
    `INSERT INTO group_members (group_id,user_id,role) VALUES ($1,$2,'GROUP_LEADER')`,
    [ids.group, ids.delegated],
  );
  await db.query(
    `INSERT INTO group_directions (id,group_id,title) VALUES ($1,$2,'Retained direction')`,
    [ids.direction, ids.group],
  );
  await db.query(
    `INSERT INTO research_projects (id,title,project_type,group_id,direction_id,lead_id) VALUES ($1,'Scratch project','COLLABORATIVE_RESEARCH',$2,$3,$4)`,
    [ids.project, ids.group, ids.direction, ids.projectLead],
  );
  for (const [key, project] of [
    ['groupOpportunity', null],
    ['projectOpportunity', ids.project],
  ]) {
    await db.query(
      `INSERT INTO research_opportunities (id,title,group_id,project_id,creator_id,opportunity_kind) VALUES ($1,'Scratch opportunity',$2,$3,$4,'RESEARCH_COLLABORATION')`,
      [ids[key], ids.group, project, ids.creator],
    );
  }
  await db.query(
    await readFile(new URL(`${upgrade}/migration.sql`, migrations), 'utf8'),
  );
  await db.query(
    await readFile(
      new URL(
        '20261118120000_group_leader_management/migration.sql',
        migrations,
      ),
      'utf8',
    ),
  );
  const policy = async (actor, opportunity) =>
    (
      await db.query('SELECT can_manage_opportunity($1,$2) AS allowed', [
        actor,
        opportunity,
      ])
    ).rows[0].allowed;
  await check(
    'upgrade retains existing membership and direction rows',
    async () => {
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM group_members WHERE archived_at IS NULL',
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM group_directions WHERE archived_at IS NULL',
          )
        ).rows[0].count,
        1,
      );
    },
  );
  await check(
    'group-linked projects follow group leadership rather than creator or project lead identity',
    async () => {
      for (const actor of ['lead', 'delegated'])
        assert.equal(await policy(ids[actor], ids.projectOpportunity), true);
      for (const actor of ['creator', 'projectLead'])
        assert.equal(await policy(ids[actor], ids.projectOpportunity), false);
    },
  );
  await check('group scope grants only its active managers', async () => {
    assert.equal(await policy(ids.lead, ids.groupOpportunity), true);
    assert.equal(await policy(ids.delegated, ids.groupOpportunity), true);
    assert.equal(await policy(ids.creator, ids.groupOpportunity), false);
  });
  await check(
    'archiving membership revokes access and authority while retaining the row',
    async () => {
      await db.query(
        'UPDATE group_members SET archived_at=clock_timestamp() WHERE group_id=$1 AND user_id=$2',
        [ids.group, ids.delegated],
      );
      assert.equal(
        (
          await db.query('SELECT is_group_member($1,$2) AS allowed', [
            ids.delegated,
            ids.group,
          ])
        ).rows[0].allowed,
        false,
      );
      assert.equal(await policy(ids.delegated, ids.groupOpportunity), false);
      assert.equal(
        (
          await db.query('SELECT can_manage_group($1,$2) AS allowed', [
            ids.delegated,
            ids.group,
          ])
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (await db.query('SELECT count(*)::int AS count FROM group_members'))
          .rows[0].count,
        1,
      );
      await db.query(
        'UPDATE group_members SET archived_at=NULL WHERE group_id=$1 AND user_id=$2',
        [ids.group, ids.delegated],
      );
      assert.equal(await policy(ids.delegated, ids.groupOpportunity), true);
    },
  );
  await check(
    'archiving a direction keeps its project reference valid',
    async () => {
      await db.query(
        'UPDATE group_directions SET archived_at=clock_timestamp() WHERE id=$1',
        [ids.direction],
      );
      assert.equal(
        (
          await db.query(
            'SELECT direction_id FROM research_projects WHERE id=$1',
            [ids.project],
          )
        ).rows[0].direction_id,
        ids.direction,
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM group_directions WHERE archived_at IS NULL',
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (await db.query('SELECT count(*)::int AS count FROM group_directions'))
          .rows[0].count,
        1,
      );
    },
  );
  await check('archived projects grant no opportunity management', async () => {
    await db.query(
      'UPDATE research_projects SET archived_at=clock_timestamp() WHERE id=$1',
      [ids.project],
    );
    assert.equal(await policy(ids.projectLead, ids.projectOpportunity), false);
  });
  console.log(`Passed ${checks} PostgreSQL integration checks.`);
} finally {
  await db.end().catch(() => {});
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
