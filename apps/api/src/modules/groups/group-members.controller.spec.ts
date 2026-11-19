import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { SESSION_RESOLVER } from '../../common/auth/session-resolver.js';
import { SessionGuard } from '../../common/guards/session.guard.js';
import { RoleGuard } from '../../common/guards/role.guard.js';
import { createHttpTestClient } from '../../../test/http-test-client.js';
import { GroupMembersController } from './group-members.controller.js';
import { GroupMembersService } from './group-members.service.js';

const groupId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const base = `/research-groups/${groupId}/members`;

describe('Group member access HTTP boundary', () => {
  let app: INestApplication;
  const client = createHttpTestClient();
  const resolver = {
    resolve: vi.fn(),
    refresh: vi.fn(),
    effectiveRoles: vi.fn(),
  };
  const members = {
    findAll: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GroupMembersController],
      providers: [
        { provide: GroupMembersService, useValue: members },
        { provide: SESSION_RESOLVER, useValue: resolver },
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: RoleGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    vi.resetAllMocks();
    resolver.resolve.mockResolvedValue({
      userId,
      sessionId: 'student',
      mustChangePassword: false,
    });
    resolver.refresh.mockResolvedValue(undefined);
    resolver.effectiveRoles.mockResolvedValue({
      isResearcher: false,
      isAdmin: false,
    });
    members.findAll.mockResolvedValue({ items: [], meta: { total: 0 } });
  });
  afterAll(async () => {
    client.close();
    await app.close();
  });

  it('allows a signed-in student without researcher access to read the active roster', async () => {
    await client
      .request(app.getHttpServer())
      .get(base)
      .set('Cookie', 'researchos_session=student')
      .expect(200);
    expect(members.findAll).toHaveBeenCalledOnce();
  });

  it('requires login to read the roster', async () => {
    await client.request(app.getHttpServer()).get(base).expect(401);
    expect(members.findAll).not.toHaveBeenCalled();
  });

  it('rejects readonly student and admin-only membership writes before calling the service', async () => {
    for (const isAdmin of [false, true]) {
      resolver.effectiveRoles.mockResolvedValue({
        isResearcher: false,
        isAdmin,
      });
      for (const method of ['post', 'patch', 'delete'] as const) {
        const path = method === 'post' ? base : `${base}/${userId}`;
        await client
          .request(app.getHttpServer())
          [method](path)
          .set('Cookie', 'researchos_session=student')
          .send({ userId, role: 'MEMBER' })
          .expect(403);
      }
    }
    expect(members.add).not.toHaveBeenCalled();
    expect(members.update).not.toHaveBeenCalled();
    expect(members.remove).not.toHaveBeenCalled();
  });
});
