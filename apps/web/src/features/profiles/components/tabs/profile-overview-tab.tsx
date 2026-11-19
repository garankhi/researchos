'use client';

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Separator,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/feedback';
import type {
  OutputResponseDto,
  ProfileInterestResponseDto,
  ProfileResponseDto,
  ProfileTab,
} from '../../types';
import { ProfileOutputItem } from '../profile-output-item';
import { ProfileOutputsSkeleton } from '../profile-skeletons';

const FEATURED_OUTPUTS_LIMIT = 5;

export function ProfileOverviewTab({
  profile,
  isOwner = false,
  outputs,
  outputsLoading = false,
  activeInterests,
  onEditProfile,
  onSelectTab,
}: {
  profile: ProfileResponseDto;
  isOwner?: boolean;
  outputs: OutputResponseDto[];
  outputsLoading?: boolean;
  activeInterests: ProfileInterestResponseDto[];
  onEditProfile?: () => void;
  onSelectTab: (tab: ProfileTab) => void;
}) {
  const t = useTranslations('profile');
  const featuredOutputs = outputs.slice(0, FEATURED_OUTPUTS_LIMIT);

  return (
    <Stack gap="4" minW="0">
      {/* 1. ResearchGate "About" & "Disciplines / Skills" Section */}
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <Flex align="center" justify="space-between" gap="3" mb="3">
          <Heading as="h2" size="md" fontWeight="bold">
            {t('overview.aboutTitle')}
          </Heading>
          {isOwner && onEditProfile ? (
            <Button
              variant="plain"
              size="xs"
              layerStyle="researchTextLink"
              px="0"
              onClick={onEditProfile}
            >
              <Pencil />
              {t('editProfile')}
            </Button>
          ) : null}
        </Flex>

        {profile.bio ? (
          <Text textStyle="sm" lineHeight="1.65" whiteSpace="pre-line">
            {profile.bio}
          </Text>
        ) : isOwner && onEditProfile ? (
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'flex-start', sm: 'center' }}
            justify="space-between"
            gap="3"
          >
            <Text textStyle="sm" color="fg.muted">
              {t('overview.noBioOwner')}
            </Text>
            <Button
              variant="outline"
              size="xs"
              flexShrink={0}
              onClick={onEditProfile}
            >
              {t('overview.addBioAction')}
            </Button>
          </Flex>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            {t('overview.noBioVisitor')}
          </Text>
        )}

        <Separator my="5" />

        <Flex align="center" justify="space-between" gap="3" mb="3">
          <Text
            textStyle="xs"
            fontWeight="semibold"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="0.04em"
          >
            {t('overview.skillsTitle')}
          </Text>
          {isOwner ? (
            <Button
              variant="plain"
              size="xs"
              layerStyle="researchTextLink"
              px="0"
              onClick={() => onSelectTab('interests')}
            >
              {t('overview.manageTopics')}
            </Button>
          ) : null}
        </Flex>

        {activeInterests.length > 0 ? (
          <Flex gap="2" wrap="wrap">
            {activeInterests.map((interest) => {
              const topicName =
                interest.topicPath?.topic?.name ?? interest.topicId;
              return (
                <Badge
                  key={interest.id}
                  variant="subtle"
                  colorPalette="gray"
                  px="2.5"
                  py="1"
                  fontWeight="medium"
                >
                  {topicName}
                </Badge>
              );
            })}
          </Flex>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            {t('overview.noTopics')}
          </Text>
        )}
      </Box>

      {/* 2. ResearchGate "Research" Section */}
      <Box bg="bg.panel" boxShadow="xs">
        <Flex
          px={{ base: '4', md: '6' }}
          py="4"
          borderBottomWidth="1px"
          borderColor="border"
          align="center"
          justify="space-between"
          gap="3"
        >
          <Heading as="h2" size="md" fontWeight="bold">
            {t('overview.featuredResearchTitle')}
            {outputs.length > 0 ? ` (${outputs.length})` : ''}
          </Heading>
          {outputs.length > 0 ? (
            <Button
              variant="plain"
              size="xs"
              layerStyle="researchTextLink"
              px="0"
              onClick={() => onSelectTab('outputs')}
            >
              {t('overview.viewAll')}
            </Button>
          ) : null}
        </Flex>

        {outputsLoading ? (
          <Box p={{ base: '4', md: '6' }}>
            <ProfileOutputsSkeleton />
          </Box>
        ) : featuredOutputs.length === 0 ? (
          <Box p={{ base: '4', md: '6' }}>
            <EmptyState
              title={t('outputsTab.emptyTitle')}
              message={t('outputsTab.emptyMessage')}
            />
          </Box>
        ) : (
          <Box>
            {featuredOutputs.map((output, index) => (
              <ProfileOutputItem
                key={output.id}
                output={output}
                showBottomBorder={index < featuredOutputs.length - 1}
              />
            ))}
          </Box>
        )}
      </Box>
    </Stack>
  );
}
