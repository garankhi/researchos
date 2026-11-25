import type { Prisma } from '@researchos/database';

export async function hasGroupManagementAuthority(
  tx: Prisma.TransactionClient,
  groupId: string,
  actorId: string,
): Promise<boolean> {
  const [policy] = await tx.$queryRaw<{ allowed: boolean }[]>`
    SELECT has_group_management_authority(${actorId}::uuid, ${groupId}::uuid) AS allowed
  `;
  return policy?.allowed === true;
}
