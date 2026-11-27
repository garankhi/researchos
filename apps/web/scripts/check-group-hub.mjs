import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const webOrigin = new URL(
  process.env.RES159_WEB_ORIGIN ?? 'http://localhost:3100',
).origin;

const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const groupId = id(1),
  leadId = id(2),
  outsiderId = id(3),
  outputId = id(4),
  pendingId = id(5),
  oldRevision = id(6),
  newRevision = id(7),
  opportunityId = id(8),
  applicationId = id(9),
  memberId = id(10);
const now = '2026-11-15T00:00:00Z';
const pageOf = (items) => ({
  items,
  meta: {
    page: 1,
    limit: 100,
    total: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
});
const revision = (revisionId, title, number, workId = outputId) => ({
  id: revisionId,
  outputId: workId,
  revisionNo: number,
  title,
  abstract: 'Research abstract',
  venue: null,
  publisher: null,
  publicationYear: 2026,
  publicationStatus: 'PUBLISHED',
  outputType: 'PAPER',
  externalUrl: 'https://example.test/paper',
  releasedAt: now,
  createdAt: now,
});
const work = (workId, rev) => ({
  id: workId,
  doi: null,
  ownerId: leadId,
  sharingStatus: 'SHARED',
  scopeType: 'PERSONAL',
  audience: 'FPTU_COMMUNITY',
  accessGroupId: null,
  importState: 'NONE',
  currentReleaseId: rev.id,
  firstSharedAt: now,
  currentRevision: rev,
  authors: [],
  topics: [],
});
const link = (workId, revId, status) => ({
  groupId,
  outputId: workId,
  requestedRevisionId: revId,
  acceptedRevisionId: status === 'ACCEPTED' ? revId : null,
  status,
  requestedBy: leadId,
  requestedAt: now,
  decisionNote: null,
  decidedBy: null,
  decidedAt: null,
  acceptedBy: null,
  acceptedAt: null,
  removedBy: null,
  removedAt: null,
});

await fs.mkdir('.cache', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {}),
});
const results = [];
async function menuAction(page, heading, action, last = false) {
  const headings = page.getByRole('heading', { name: heading, exact: true });
  const card = (last ? headings.last() : headings.first()).locator('..');
  await card
    .getByRole('button', { name: 'Group actions', exact: true })
    .click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
try {
  async function scenario(
    role,
    {
      locale = 'en',
      mobile = false,
      dark = false,
      failMembers = false,
      empty = false,
      slow = false,
      archived = false,
      large = false,
      projectRestricted = false,
      opportunityPipeline = false,
    } = {},
  ) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      colorScheme: dark ? 'dark' : 'light',
    });
    await context.addInitScript(
      (dark) => localStorage.setItem('theme', dark ? 'dark' : 'light'),
      dark,
    );
    const page = await context.newPage();
    const errors = [],
      requests = [],
      writes = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let group = {
      id: groupId,
      code: 'RG',
      name: 'Research Group Hub',
      leadId,
      callerMembershipRole:
        role === 'leader'
          ? 'GROUP_LEADER'
          : role === 'member'
            ? 'MEMBER'
            : undefined,
      description: 'Group research description',
      isActive: !archived,
      archivedAt: archived ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    let opportunity = {
      id: opportunityId,
      groupId,
      projectId: projectRestricted ? id(20) : null,
      // Even a stale/permissive per-record flag must not expose actions in a readonly hub.
      canManage: !projectRestricted,
      creatorId: leadId,
      title: 'Research collaboration',
      opportunityKind: 'RESEARCH_COLLABORATION',
      targetAudience: 'ANY_RESEARCHER',
      expectedRole: 'Coauthor',
      requiredExpertiseTags: ['AI'],
      description: 'Join our research project',
      responseSlaDays: 7,
      autoFillOnAcceptance: opportunityPipeline,
      applicationDeadline: '2099-12-01T00:00:00Z',
      status:
        role === 'outsider' || projectRestricted || opportunityPipeline
          ? 'OPEN'
          : 'DRAFT',
      publishedAt: null,
      archivedAt: null,
    };
    let applications = [
      {
        id: applicationId,
        opportunityId,
        opportunityTitle: opportunity.title,
        applicantId: opportunityPipeline ? outsiderId : memberId,
        applicantNote: 'I would like to collaborate',
        status: 'PENDING',
        responseNote: null,
        respondedBy: null,
        appliedAt: now,
        responseDueAt: '2099-12-01T00:00:00Z',
        respondedAt: null,
        withdrawnAt: null,
        countdownAsOf: now,
        remainingSeconds: 100,
        isOverdue: false,
      },
    ];
    let links = empty
      ? []
      : [
          link(outputId, oldRevision, 'ACCEPTED'),
          ...(['lead', 'leader'].includes(role)
            ? [link(pendingId, newRevision, 'PENDING')]
            : []),
        ];
    let fail = failMembers;
    const members = [
      {
        groupId,
        userId: leadId,
        role: 'GROUP_LEADER',
        joinedAt: now,
        fullName: 'Group Lead',
        email: 'lead@example.test',
        departmentUnit: 'Computing',
        academicTitle: null,
        academicDegree: 'PhD',
        userType: 'FACULTY',
        avatarStorageKey: null,
        bio: 'Group lead biography',
      },
      {
        groupId,
        userId: memberId,
        role: role === 'leader' ? 'GROUP_LEADER' : 'MEMBER',
        joinedAt: now,
        fullName: 'Research Member',
        email: 'member@example.test',
        departmentUnit: 'Computing',
        academicTitle: null,
        academicDegree: null,
        userType: 'STUDENT',
        avatarStorageKey: null,
        bio: null,
      },
    ];
    if (large)
      members.splice(
        1,
        0,
        ...Array.from({ length: 19 }, (_, index) => ({
          ...members[0],
          userId: id(100 + index),
          fullName: `Other Member ${index}`,
          role: 'MEMBER',
        })),
      );
    let directionArchived = false;
    await context.route('http://localhost:4000/**', async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname,
        method = request.method();
      const headers = {
        'access-control-allow-origin': webOrigin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
      requests.push({ path, method, search: url.search });
      let data,
        status = 200;
      if (method !== 'GET')
        writes.push({ path, method, data: request.postDataJSON() });
      if (path === '/me')
        data = {
          id:
            role === 'lead'
              ? leadId
              : ['leader', 'member'].includes(role)
                ? memberId
                : outsiderId,
          fullName: 'Test Researcher',
          email: 'test@example.test',
          userType: 'FACULTY',
          departmentUnit: 'Computing',
          academicTitle: null,
          academicDegree: null,
          roles: role === 'admin' ? ['RESEARCHER', 'ADMIN'] : ['RESEARCHER'],
          onboardingCompleted: true,
          profileConfirmed: true,
          mustChangePassword: false,
        };
      else if (path === `/research-groups/${groupId}`) {
        if (slow && method === 'GET')
          await new Promise((resolve) => setTimeout(resolve, 1000));
        if (method === 'PATCH')
          group = {
            ...group,
            ...request.postDataJSON(),
            ...(request.postDataJSON().isActive === false
              ? { archivedAt: now }
              : {}),
          };
        data = group;
      } else if (path === `/research-groups/${groupId}/members`) {
        const visibleMembers = empty
          ? []
          : members.filter((member) => !member.archivedAt);
        const requestedPage = Number(url.searchParams.get('page') ?? 1);
        if (fail) {
          status = 503;
          data = null;
        } else
          data = {
            items: visibleMembers.slice(
              (requestedPage - 1) * 20,
              requestedPage * 20,
            ),
            meta: {
              ...pageOf(visibleMembers).meta,
              page: requestedPage,
              limit: 20,
              hasNextPage: requestedPage * 20 < visibleMembers.length,
            },
          };
      } else if (
        path.startsWith(`/research-groups/${groupId}/members/`) &&
        method === 'DELETE'
      ) {
        members.find(
          (member) => member.userId === path.split('/').at(-1),
        ).archivedAt = now;
        return route.fulfill({ status: 204, headers });
      } else if (path === `/research-groups/${groupId}/directions`)
        data = pageOf(
          empty || directionArchived
            ? []
            : [
                {
                  id: id(11),
                  groupId,
                  title: 'Responsible AI',
                  description: 'Research direction description',
                  topicId: null,
                  topicPath: null,
                  createdAt: now,
                },
              ],
        );
      else if (
        path.startsWith(`/research-groups/${groupId}/directions/`) &&
        method === 'DELETE'
      ) {
        directionArchived = true;
        return route.fulfill({ status: 204, headers });
      } else if (path === `/research-groups/${groupId}/outputs`) {
        if (method === 'POST') {
          const requestData = request.postDataJSON();
          const requested = link(
            requestData.outputId,
            requestData.revisionId,
            'PENDING',
          );
          links.push(requested);
          data = requested;
          status = 201;
        } else
          data = pageOf(
            links.filter(
              (link) =>
                !url.searchParams.get('status') ||
                link.status === url.searchParams.get('status'),
            ),
          );
      } else if (path.startsWith(`/research-groups/${groupId}/outputs/`)) {
        const workId = path.split('/').at(-1);
        links = links.map((row) =>
          row.outputId === workId
            ? {
                ...row,
                ...request.postDataJSON(),
                acceptedRevisionId: row.requestedRevisionId,
              }
            : row,
        );
        data = links.find((row) => row.outputId === workId);
      } else if (path === '/opportunities')
        data = pageOf(empty ? [] : [opportunity]);
      else if (path === `/opportunities/${opportunityId}`) data = opportunity;
      else if (
        path === `/opportunities/${opportunityId}/applications` &&
        method === 'POST'
      ) {
        data = {
          ...applications[0],
          applicantNote: request.postDataJSON().applicantNote,
        };
        opportunity = { ...opportunity, myApplicationStatus: 'PENDING' };
        status = 201;
      } else if (path === `/opportunities/${opportunityId}/open`) {
        opportunity = { ...opportunity, status: 'OPEN' };
        data = opportunity;
      } else if (path === `/research-groups/${groupId}/applications`)
        data = pageOf(empty ? [] : applications);
      else if (path === `/applications/${applicationId}/respond`) {
        applications = applications.map((row) => ({
          ...row,
          status: request.postDataJSON().decision,
          responseNote: request.postDataJSON().responseNote,
        }));
        data = applications[0];
        if (data.status === 'ACCEPTED') {
          members.push({
            ...members[1],
            userId: outsiderId,
            fullName: 'Accepted Researcher',
            role: 'MEMBER',
          });
          opportunity = { ...opportunity, status: 'FILLED' };
          data = {
            ...data,
            membership: { groupId, userId: outsiderId, role: 'MEMBER' },
          };
        }
      } else if (path === '/outputs')
        data = pageOf([
          work(outputId, revision(newRevision, 'Latest release title', 2)),
          {
            ...work(
              id(14),
              revision(id(15), 'Other researcher work', 1, id(14)),
            ),
            ownerId: outsiderId,
          },
        ]);
      else if (path === `/outputs/${id(14)}`)
        data = {
          ...work(id(14), revision(id(15), 'Other researcher work', 1, id(14))),
          ownerId: outsiderId,
        };
      else if (path === `/outputs/${id(14)}/revisions`)
        data = [revision(id(15), 'Other researcher work', 1, id(14))];
      else if (path === `/outputs/${outputId}`)
        data = work(outputId, revision(newRevision, 'Latest release title', 2));
      else if (path === `/outputs/${outputId}/revisions`)
        data = [
          revision(oldRevision, 'Pinned accepted title', 1),
          revision(newRevision, 'Latest release title', 2),
        ];
      else if (path === `/outputs/${pendingId}`)
        data = work(
          pendingId,
          revision(newRevision, 'Pending requested title', 2, pendingId),
        );
      else if (path === `/outputs/${pendingId}/revisions`)
        data = [revision(newRevision, 'Pending requested title', 2, pendingId)];
      else if (path === '/taxonomy/topics')
        data = pageOf([
          {
            id: id(12),
            subfieldId: id(13),
            name: 'Machine learning',
            description: null,
            source: 'LOCAL',
            externalId: null,
            isActive: true,
          },
        ]);
      else {
        status = 404;
        data = null;
      }
      await route.fulfill({
        status,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(
          status >= 400
            ? { success: false, message: 'service_unavailable' }
            : { success: true, data, message: 'ok' },
        ),
      });
    });
    await page.goto(`${webOrigin}/${locale}/groups/${groupId}`);
    if (slow) {
      await page.getByTestId('loading-skeleton').first().waitFor();
      results.push('loading skeleton');
    }
    await page
      .getByRole('heading', { name: 'Research Group Hub', exact: true })
      .waitFor();
    return {
      context,
      page,
      errors,
      requests,
      writes,
      recover: () => {
        fail = false;
      },
    };
  }

  for (const mobile of [false, true]) {
    const applicant = await scenario('outsider', {
      mobile,
      opportunityPipeline: true,
    });
    await applicant.page.getByRole('tab', { name: /^Opportunities/ }).click();
    await applicant.page
      .getByRole('link', { name: 'Research collaboration', exact: true })
      .click();
    const apply = applicant.page.getByRole('button', {
      name: 'Apply',
      exact: true,
    });
    await apply.press('Enter');
    const submit = applicant.page.getByRole('button', {
      name: 'Send application',
      exact: true,
    });
    await submit.press('Enter');
    await applicant.page
      .getByText('Enter an application note.', { exact: true })
      .waitFor();
    const note = applicant.page.getByRole('textbox', {
      name: 'Your note',
      exact: true,
    });
    await note.fill('I would like to contribute.');
    await submit.press('Enter');
    await applicant.page
      .getByText('Your application was sent.', { exact: true })
      .first()
      .waitFor();
    const applications = applicant.writes.filter(({ path }) =>
      path.endsWith('/applications'),
    );
    assert.equal(applications.length, 1);
    assert.equal(
      applications[0].data.applicantNote,
      'I would like to contribute.',
    );
    await applicant.page.reload();
    await applicant.page
      .getByText('Your application: Pending', { exact: true })
      .waitFor();
    assert.equal(await apply.count(), 0);
    assert.deepEqual(applicant.errors, []);
    await applicant.context.close();
  }
  results.push(
    'keyboard application and persisted status after reload at desktop and mobile widths',
  );

  const manager = await scenario('lead', { opportunityPipeline: true });
  const roster = () =>
    manager.requests.filter(({ path }) => path.endsWith('/members')).length;
  const opportunityLists = () =>
    manager.requests.filter(({ path }) => path === '/opportunities').length;
  await manager.page
    .getByRole('tab', { name: /^Inbound applications/ })
    .click();
  await manager.page
    .getByText('I would like to collaborate', { exact: true })
    .waitFor();
  const before = { roster: roster(), opportunities: opportunityLists() };
  await manager.page
    .getByRole('button', { name: 'Group actions', exact: true })
    .last()
    .click();
  await manager.page
    .getByRole('menuitem', { name: 'Accept application', exact: true })
    .click();
  const dialog = manager.page.getByRole('dialog', {
    name: 'Accept application',
    exact: true,
  });
  await dialog
    .getByText(/adds the applicant to the group as a Member/)
    .waitFor();
  await dialog
    .getByRole('textbox', { name: 'Response note' })
    .fill('Welcome to the group');
  await dialog
    .getByRole('button', { name: 'Accept application', exact: true })
    .press('Enter');
  await manager.page
    .getByText('Welcome to the group', { exact: true })
    .waitFor();
  await manager.page.getByRole('tab', { name: /^Members/ }).click();
  await manager.page
    .getByText('Accepted Researcher', { exact: true })
    .waitFor();
  assert(roster() > before.roster);
  assert(opportunityLists() > before.opportunities);
  assert(manager.writes.some(({ data }) => data?.decision === 'ACCEPTED'));
  assert.deepEqual(manager.errors, []);
  await manager.context.close();
  results.push(
    'acceptance confirmation refreshes the application, opportunity, and member collections',
  );

  if (process.argv.includes('--opportunity-pipeline')) {
    console.log(JSON.stringify({ passed: results }, null, 2));
    await browser.close();
    process.exit(0);
  }

  const readonly = await scenario('outsider');
  await readonly.page
    .getByRole('heading', { name: 'Pinned accepted title' })
    .waitFor();
  assert.equal(
    await readonly.page
      .getByRole('heading', { name: 'Latest release title' })
      .count(),
    0,
  );
  assert.equal(
    await readonly.page
      .getByRole('button', { name: 'Edit group information', exact: true })
      .count(),
    0,
  );
  assert.equal(
    readonly.requests.some((request) => request.path.endsWith('/applications')),
    false,
  );
  assert.equal(
    readonly.requests.some(
      (request) =>
        request.path === '/opportunities' &&
        request.search.includes('status=OPEN'),
    ),
    true,
  );
  await readonly.page.screenshot({
    path: '.cache/res159-readonly.png',
    fullPage: true,
  });
  assert.deepEqual(readonly.errors, []);
  await readonly.context.close();
  results.push(
    'readonly access, open filter, no inbound request, pinned revision',
  );

  for (const role of ['member', 'admin']) {
    const viewer = await scenario(role);
    await viewer.page.getByText('Read-only view', { exact: true }).waitFor();
    assert.equal(
      await viewer.page
        .getByRole('button', { name: 'Group actions', exact: true })
        .count(),
      0,
    );
    assert.equal(
      await viewer.page
        .getByRole('button', { name: 'Create opportunity', exact: true })
        .count(),
      0,
    );
    assert.equal(
      viewer.requests.some(
        (request) =>
          request.path.endsWith('/applications') ||
          request.search.includes('status=PENDING'),
      ),
      false,
    );
    assert.equal(viewer.writes.length, 0);
    await viewer.context.close();
  }
  results.push(
    'ordinary members and unrelated admins remain readonly despite per-posting flags',
  );

  const lead = await scenario('lead');
  await lead.page
    .getByRole('heading', { name: 'Pending requested title' })
    .waitFor();
  await menuAction(lead.page, 'Research Group Hub', 'Edit group information');
  await lead.page
    .getByRole('dialog', { name: 'Edit group information', exact: true })
    .waitFor();
  await lead.page
    .getByRole('textbox', { name: 'Group name', exact: true })
    .fill('');
  await lead.page.getByRole('button', { name: 'Save', exact: true }).click();
  await lead.page
    .getByText('The submitted data is invalid.', { exact: true })
    .waitFor();
  assert.equal(lead.writes.length, 0);
  await lead.page
    .getByRole('textbox', { name: 'Group name', exact: true })
    .fill('Updated Research Group');
  await lead.page.getByRole('button', { name: 'Save', exact: true }).click();
  await lead.page
    .getByRole('heading', { name: 'Updated Research Group', exact: true })
    .waitFor();
  await menuAction(lead.page, 'Pending requested title', 'Accept');
  await menuAction(
    lead.page,
    'Research collaboration',
    'Open for applications',
  );
  await menuAction(lead.page, 'Research collaboration', 'Mark as filled');
  await lead.page
    .getByRole('alertdialog', { name: 'Mark as filled', exact: true })
    .waitFor();
  await lead.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await menuAction(
    lead.page,
    'Research collaboration',
    'Respond to application',
    true,
  );
  await lead.page
    .getByRole('combobox', { name: 'Decision', exact: true })
    .selectOption('DECLINED');
  await lead.page
    .getByRole('textbox', { name: 'Response note', exact: true })
    .fill('Thank you for applying');
  await lead.page.getByRole('button', { name: 'Save', exact: true }).click();
  await lead.page
    .getByText('Thank you for applying', { exact: true })
    .waitFor();
  assert(
    lead.writes.some(
      (request) =>
        request.path.endsWith('/respond') &&
        request.data.decision === 'DECLINED',
    ),
  );
  await lead.page
    .getByRole('button', { name: 'Request an output link', exact: true })
    .click();
  await lead.page
    .getByRole('combobox', { name: 'Research output', exact: true })
    .selectOption(id(14));
  await lead.page
    .getByRole('combobox', { name: 'Choose a released revision', exact: true })
    .selectOption(id(15));
  await lead.page.getByRole('button', { name: 'Save', exact: true }).click();
  await lead.page
    .getByRole('heading', { name: 'Other researcher work', exact: true })
    .waitFor();
  assert(
    lead.writes.some(
      (request) =>
        request.method === 'POST' &&
        request.path.endsWith('/outputs') &&
        request.data.outputId === id(14) &&
        request.data.revisionId === id(15),
    ),
  );
  await menuAction(lead.page, 'Research Member', 'Archive membership');
  await lead.page
    .getByRole('alertdialog', { name: 'Archive membership', exact: true })
    .waitFor();
  await lead.page
    .getByRole('button', { name: 'Confirm: Archive membership', exact: true })
    .click();
  await lead.page
    .getByText('Research Member', { exact: true })
    .waitFor({ state: 'detached' });
  await menuAction(lead.page, 'Responsible AI', 'Archive direction');
  await lead.page
    .getByRole('button', { name: 'Confirm: Archive direction', exact: true })
    .click();
  await lead.page
    .getByRole('heading', { name: 'Responsible AI', exact: true })
    .waitFor({ state: 'detached' });
  await menuAction(lead.page, 'Updated Research Group', 'Archive group');
  assert.equal(
    lead.writes.some((request) => request.data?.isActive === false),
    false,
  );
  await lead.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await lead.page.screenshot({
    path: '.cache/res159-lead.png',
    fullPage: true,
  });
  assert.deepEqual(lead.errors, []);
  await lead.context.close();
  results.push(
    'lead edit, output acceptance, opportunity open, application response, archive confirmation',
  );

  const leader = await scenario('leader');
  await leader.page
    .getByRole('button', { name: 'Publish direction', exact: true })
    .waitFor();
  assert.equal(
    await leader.page
      .getByRole('button', { name: 'Request an output link', exact: true })
      .count(),
    1,
  );
  await menuAction(leader.page, 'Research Group Hub', 'Edit group information');
  await leader.page
    .getByRole('dialog', { name: 'Edit group information', exact: true })
    .waitFor();
  await leader.page
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await menuAction(leader.page, 'Pending requested title', 'Reject');
  await leader.page
    .getByRole('alertdialog', { name: 'Reject', exact: true })
    .waitFor();
  await leader.page
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await leader.page
    .getByRole('button', { name: 'Publish direction', exact: true })
    .click();
  await leader.page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('New direction');
  await leader.page
    .getByRole('button', { name: 'Machine learning', exact: true })
    .click();
  await leader.page
    .getByText('Selected topic: Machine learning', { exact: true })
    .waitFor();
  assert.deepEqual(leader.errors, []);
  await leader.context.close();
  results.push('GROUP_LEADER permissions and topic picker');

  const paged = await scenario('leader', { large: true });
  await paged.page
    .getByRole('button', { name: 'Publish direction', exact: true })
    .waitFor();
  assert(
    !paged.requests.some(
      (request) =>
        request.path.endsWith('/members') && request.search.includes('page=2'),
    ),
  );
  await paged.page
    .getByRole('button', { name: 'Load more', exact: true })
    .click();
  await paged.page.getByText('Research Member', { exact: true }).waitFor();
  assert(
    paged.requests.some(
      (request) =>
        request.path.endsWith('/members') && request.search.includes('page=2'),
    ),
  );
  assert.deepEqual(paged.errors, []);
  await paged.context.close();
  results.push(
    'incremental pagination and leadership before later roster pages load',
  );

  const restricted = await scenario('lead', { projectRestricted: true });
  await restricted.page
    .getByRole('heading', { name: 'Research collaboration', exact: true })
    .first()
    .waitFor();
  assert.equal(
    await restricted.page
      .getByRole('button', { name: 'Mark as filled', exact: true })
      .count(),
    0,
  );
  assert.deepEqual(restricted.errors, []);
  await restricted.context.close();
  results.push(
    'project-scoped posting hides management when server denies permission',
  );

  const vi = await scenario('outsider', {
    locale: 'vi',
    mobile: true,
    dark: true,
  });
  await vi.page
    .getByRole('heading', { name: 'Kết quả nghiên cứu', exact: true })
    .waitFor();
  await vi.page
    .getByRole('heading', { name: 'Pinned accepted title' })
    .waitFor();
  assert(
    await vi.page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    ),
  );
  assert(
    await vi.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await vi.page.screenshot({
    path: '.cache/res159-vi-mobile-dark.png',
    fullPage: true,
  });
  assert.deepEqual(vi.errors, []);
  await vi.context.close();
  results.push('Vietnamese, mobile, dark theme, no horizontal overflow');

  const empty = await scenario('outsider', { empty: true, slow: true });
  await empty.page
    .getByText('Nothing published here yet', { exact: true })
    .first()
    .waitFor();
  assert.deepEqual(empty.errors, []);
  await empty.context.close();
  results.push('empty collections');

  const failed = await scenario('outsider', { failMembers: true });
  await failed.page
    .getByText('Could not load this section', { exact: true })
    .waitFor({ timeout: 30000 });
  failed.recover();
  await failed.page.getByRole('button', { name: /retry|try again/i }).click();
  await failed.page.getByText('Group Lead', { exact: true }).waitFor();
  assert.deepEqual(failed.errors, []);
  await failed.context.close();
  results.push('section error and retry recovery');

  const archived = await scenario('lead', { archived: true });
  await menuAction(archived.page, 'Research Group Hub', 'Restore group');
  await archived.page
    .getByRole('alertdialog', { name: 'Restore group', exact: true })
    .waitFor();
  await archived.page
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  assert.equal(
    await archived.page
      .getByRole('button', { name: 'Create opportunity', exact: true })
      .count(),
    0,
  );
  assert.equal(
    archived.requests.some((request) => request.path.endsWith('/applications')),
    false,
  );
  assert.deepEqual(archived.errors, []);
  await archived.context.close();
  results.push('archived active-only workflows hidden');

  console.log(JSON.stringify({ passed: results }, null, 2));
  await fs.writeFile(
    '.cache/res159-browser-results.json',
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
