'use client';

import Image from 'next/image';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Link,
  Separator,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
  Building2,
  ExternalLink,
  GraduationCap,
  Mail,
  Sparkles,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EntityLink } from '@/features/discovery';
import type {
  OutputResponseDto,
  ProfileInterestResponseDto,
  ProfileResponseDto,
  ProfileTab,
  ResearchGroupResponseDto,
} from '../types';

interface CoAuthorSummary {
  key: string;
  userId: string | null;
  name: string;
  sharedCount: number;
}

function extractCoAuthors(
  outputs: OutputResponseDto[],
  ownerUserId: string,
  ownerFullName: string,
): CoAuthorSummary[] {
  const map = new Map<string, CoAuthorSummary>();
  const normalizedOwnerName = ownerFullName.trim().toLowerCase();

  for (const output of outputs) {
    for (const author of output.authors ?? []) {
      const uid = typeof author.userId === 'string' ? author.userId : null;
      if (uid === ownerUserId) continue;
      if (
        !uid &&
        author.authorNameString.trim().toLowerCase() === normalizedOwnerName
      ) {
        continue;
      }

      const key = uid ?? `name:${author.authorNameString.trim().toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.sharedCount += 1;
      } else {
        map.set(key, {
          key,
          userId: uid,
          name: author.authorNameString,
          sharedCount: 1,
        });
      }
    }
  }

  return [...map.values()]
    .sort(
      (a, b) => b.sharedCount - a.sharedCount || a.name.localeCompare(b.name),
    )
    .slice(0, 6);
}

export function ProfileSidebar({
  profile,
  isOwner = false,
  outputs,
  groups,
  ledGroupIds,
  activeInterests,
  pendingOpenAlexCount = 0,
  onSelectTab,
}: {
  profile: ProfileResponseDto;
  isOwner?: boolean;
  outputs: OutputResponseDto[];
  groups: ResearchGroupResponseDto[];
  ledGroupIds: Set<string>;
  activeInterests: ProfileInterestResponseDto[];
  pendingOpenAlexCount?: number;
  onSelectTab: (tab: ProfileTab) => void;
}) {
  const t = useTranslations('profile');
  const sharedOutputsCount = outputs.filter(
    (item) => item.sharingStatus === 'SHARED',
  ).length;
  const draftOutputsCount = outputs.length - sharedOutputsCount;
  const coAuthors = extractCoAuthors(outputs, profile.userId, profile.fullName);

  const rankAndDegree = [profile.academicTitle, profile.academicDegree]
    .filter(Boolean)
    .join(' · ');

  const hasExternalIds = Boolean(
    profile.orcidId || profile.googleScholarUrl || profile.scopusAuthorId,
  );

  return (
    <Stack as="aside" gap="4" minW="0">
      {/* 1. Academic Stats Summary */}
      <Box bg="bg.panel" boxShadow="xs" p="5">
        <Heading as="h2" size="sm" fontWeight="bold" mb="4">
          {t('overview.statsTitle')}
        </Heading>

        <SimpleGrid columns={3} gap="0" borderTopWidth="1px" pt="3.5">
          <Box pr="3" borderRightWidth="1px">
            <Text fontSize="xl" fontWeight="bold" lineHeight="1.1">
              {sharedOutputsCount}
            </Text>
            <Text textStyle="xs" color="fg.muted" mt="1">
              {t('overview.statsPublications')}
            </Text>
            {isOwner && draftOutputsCount > 0 ? (
              <Text textStyle="xs" color="blue.solid" mt="0.5">
                {t('overview.statsDrafts', { count: draftOutputsCount })}
              </Text>
            ) : null}
          </Box>

          <Box px="3" borderRightWidth="1px">
            <Text fontSize="xl" fontWeight="bold" lineHeight="1.1">
              {groups.length}
            </Text>
            <Text textStyle="xs" color="fg.muted" mt="1">
              {t('overview.statsGroups')}
            </Text>
          </Box>

          <Box pl="3">
            <Text fontSize="xl" fontWeight="bold" lineHeight="1.1">
              {activeInterests.length}
            </Text>
            <Text textStyle="xs" color="fg.muted" mt="1">
              {t('overview.statsTopics')}
            </Text>
          </Box>
        </SimpleGrid>

        {isOwner && pendingOpenAlexCount > 0 ? (
          <Flex
            mt="4"
            pt="3.5"
            borderTopWidth="1px"
            align="center"
            justify="space-between"
            gap="2"
          >
            <Flex align="center" gap="2" minW="0">
              <Icon as={Sparkles} boxSize="4" color="blue.solid" aria-hidden />
              <Text textStyle="xs" color="fg.muted">
                {t('overview.pendingClaimsNotice', {
                  count: pendingOpenAlexCount,
                })}
              </Text>
            </Flex>
            <Button
              variant="plain"
              size="xs"
              layerStyle="researchTextLink"
              color="blue.solid"
              px="0"
              flexShrink={0}
              onClick={() => onSelectTab('openalex')}
            >
              {t('overview.reviewNow')}
            </Button>
          </Flex>
        ) : null}
      </Box>

      {/* 2. Affiliation & Verified Identifiers */}
      <Box bg="bg.panel" boxShadow="xs" p="5">
        <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
          {t('overview.affiliationTitle')}
        </Heading>

        <Stack gap="3">
          <Flex gap="2.5" align="flex-start">
            <Icon
              as={Building2}
              boxSize="4"
              color="fg.muted"
              mt="0.5"
              flexShrink={0}
              aria-hidden
            />
            <Box minW="0">
              <Text textStyle="xs" color="fg.muted">
                {t('overview.departmentLabel')}
              </Text>
              <Text textStyle="sm" fontWeight="medium">
                {profile.departmentUnit}
              </Text>
            </Box>
          </Flex>

          {rankAndDegree ? (
            <Flex gap="2.5" align="flex-start">
              <Icon
                as={GraduationCap}
                boxSize="4"
                color="fg.muted"
                mt="0.5"
                flexShrink={0}
                aria-hidden
              />
              <Box minW="0">
                <Text textStyle="xs" color="fg.muted">
                  {t('overview.positionLabel')}
                </Text>
                <Text textStyle="sm">{rankAndDegree}</Text>
              </Box>
            </Flex>
          ) : null}

          <Flex gap="2.5" align="flex-start">
            <Icon
              as={Mail}
              boxSize="4"
              color="fg.muted"
              mt="0.5"
              flexShrink={0}
              aria-hidden
            />
            <Box minW="0">
              <Text textStyle="xs" color="fg.muted">
                {t('overview.emailLabel')}
              </Text>
              <Link
                href={`mailto:${profile.email}`}
                textStyle="sm"
                layerStyle="researchTextLink"
                wordBreak="break-all"
              >
                {profile.email}
              </Link>
            </Box>
          </Flex>

          {(hasExternalIds || isOwner) && (
            <>
              <Separator />
              <Box>
                <Text textStyle="xs" color="fg.muted" mb="2">
                  {t('overview.externalIdsLabel')}
                </Text>
                {hasExternalIds ? (
                  <Stack gap="1.5">
                    {profile.orcidId ? (
                      <Link
                        href={`https://orcid.org/${profile.orcidId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        display="inline-flex"
                        alignItems="center"
                        justifyContent="space-between"
                        gap="2"
                        textStyle="sm"
                        layerStyle="researchTextLink"
                      >
                        <Text as="span" truncate>
                          ORCID · {profile.orcidId}
                        </Text>
                        <Icon
                          as={ExternalLink}
                          boxSize="3.5"
                          flexShrink={0}
                          aria-hidden
                        />
                      </Link>
                    ) : null}

                    {profile.googleScholarUrl ? (
                      <Link
                        href={profile.googleScholarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        display="inline-flex"
                        alignItems="center"
                        justifyContent="space-between"
                        gap="2"
                        textStyle="sm"
                        layerStyle="researchTextLink"
                      >
                        <Text as="span">Google Scholar</Text>
                        <Icon
                          as={ExternalLink}
                          boxSize="3.5"
                          flexShrink={0}
                          aria-hidden
                        />
                      </Link>
                    ) : null}

                    {profile.scopusAuthorId ? (
                      <Link
                        href={`https://www.scopus.com/authid/detail.uri?authorId=${profile.scopusAuthorId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        display="inline-flex"
                        alignItems="center"
                        justifyContent="space-between"
                        gap="2"
                        textStyle="sm"
                        layerStyle="researchTextLink"
                      >
                        <Text as="span" truncate>
                          Scopus · {profile.scopusAuthorId}
                        </Text>
                        <Icon
                          as={ExternalLink}
                          boxSize="3.5"
                          flexShrink={0}
                          aria-hidden
                        />
                      </Link>
                    ) : null}
                  </Stack>
                ) : (
                  <Text textStyle="xs" color="fg.muted">
                    {t('overview.noExternalIdsOwner')}
                  </Text>
                )}
              </Box>
            </>
          )}
        </Stack>
      </Box>

      {/* 3. Co-authors Card (ResearchGate right-column signature) */}
      {coAuthors.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
            {t('overview.coAuthorsTitle')} ({coAuthors.length})
          </Heading>

          <Stack gap="3">
            {coAuthors.map((coAuthor) => (
              <Flex key={coAuthor.key} align="center" gap="3" minW="0">
                <Box flexShrink={0} boxSize="9">
                  <Image
                    src="/default-avatar.webp"
                    alt=""
                    width={36}
                    height={36}
                    unoptimized
                  />
                </Box>
                <Box minW="0" flex="1">
                  {coAuthor.userId ? (
                    <EntityLink
                      entityType="RESEARCHER"
                      entityId={coAuthor.userId}
                      href={`/profile/${coAuthor.userId}`}
                    >
                      {coAuthor.name}
                    </EntityLink>
                  ) : (
                    <Text textStyle="sm" fontWeight="semibold" truncate>
                      {coAuthor.name}
                    </Text>
                  )}
                  <Text textStyle="xs" color="fg.muted">
                    {t('overview.coAuthoredCount', {
                      count: coAuthor.sharedCount,
                    })}
                  </Text>
                </Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      ) : null}

      {/* 4. Affiliated Labs & Research Groups */}
      {groups.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Flex align="center" justify="space-between" gap="2" mb="3.5">
            <Heading as="h2" size="sm" fontWeight="bold">
              {t('overview.groupsSidebarTitle')}
            </Heading>
            <Button
              variant="plain"
              size="xs"
              layerStyle="researchTextLink"
              px="0"
              onClick={() => onSelectTab('groups')}
            >
              {t('overview.viewAll')}
            </Button>
          </Flex>

          <Stack gap="3">
            {groups.slice(0, 4).map((group) => {
              const isLeader = ledGroupIds.has(group.id);
              return (
                <Flex
                  key={group.id}
                  align="flex-start"
                  justify="space-between"
                  gap="2"
                >
                  <Flex align="flex-start" gap="2" minW="0" flex="1">
                    <Icon
                      as={Users}
                      boxSize="4"
                      color="fg.muted"
                      mt="0.5"
                      flexShrink={0}
                      aria-hidden
                    />
                    <Box minW="0">
                      <EntityLink
                        entityType="GROUP"
                        entityId={group.id}
                        href={`/groups/${group.id}`}
                      >
                        {group.name}
                      </EntityLink>
                      <Text textStyle="xs" color="fg.muted">
                        {group.code}
                      </Text>
                    </Box>
                  </Flex>
                  <Badge
                    variant="subtle"
                    colorPalette={isLeader ? 'blue' : 'gray'}
                    flexShrink={0}
                  >
                    {isLeader
                      ? t('groupsTab.leaderBadge')
                      : t('groupsTab.memberBadge')}
                  </Badge>
                </Flex>
              );
            })}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
