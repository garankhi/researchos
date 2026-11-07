import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { SessionGuard } from './session.guard.js';

describe('SessionGuard', () => {
  const query = vi.fn();
  const guard = new SessionGuard({
    $queryRaw: query,
  } as unknown as PrismaService);
  const context = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as ExecutionContext;
  beforeEach(() => vi.resetAllMocks());

  it.each([undefined, 'Bearer', 'Basic secret', 'Bearer a b'])(
    'rejects a missing or malformed bearer session',
    async (authorization) => {
      await expect(
        guard.canActivate(context({ headers: { authorization } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('rejects sessions absent from the active/password-ready query', async () => {
    query.mockResolvedValue([]);
    await expect(
      guard.canActivate(
        context({ headers: { authorization: 'Bearer secret' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('hashes the token and sets the server-resolved actor', async () => {
    query.mockResolvedValue([{ userId: 'trusted-user' }]);
    const request = {
      headers: { authorization: 'Bearer secret' },
      actorId: 'spoof',
    };
    expect(await guard.canActivate(context(request))).toBe(true);
    expect(request.actorId).toBe('trusted-user');
    expect(query.mock.calls[0][1]).toBe(
      createHash('sha256').update('secret').digest('hex'),
    );
  });
});
