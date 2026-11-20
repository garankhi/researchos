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
  Stack,
  Text,
} from '@chakra-ui/react';
import { ExternalLink, Mail, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FieldError } from '@/components/ui/feedback';
import { useRouter } from '@/i18n/navigation';
import { FollowButton } from '@/features/follow';
import { useProfileSocial } from '../hooks/use-profile-social';
import type {
  ProfileResponseDto,
  ProfileResponseDtoAvailabilityStatus,
} from '../types';

function getAvailabilityPalette(
  status: ProfileResponseDtoAvailabilityStatus,
): 'green' | 'blue' | 'gray' {
  switch (status) {
    case 'OPEN_FOR_COLLABORATION':
      return 'green';
    case 'SEEKING_GROUP':
    case 'MENTORING_ONLY':
      return 'blue';
    case 'LIMITED_AVAILABILITY':
    case 'NOT_AVAILABLE':
    default:
      return 'gray';
  }
}

export function ProfileHeader({
  profile,
  isOwner,
  onEdit,
}: {
  profile: ProfileResponseDto;
  isOwner?: boolean;
  onEdit?: () => void;
}) {
  const t = useTranslations('profile');
  const tAvailability = useTranslations('profile.availability');
  const router = useRouter();

  const social = useProfileSocial({
    targetUserId: profile.userId,
    isOwner,
  });

  const academicSubtitle = [
    profile.departmentUnit,
    profile.academicTitle,
    profile.academicDegree,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleMessage = async () => {
    try {
      const conversationId = await social.startDirectChat();
      router.push(`/chat/${conversationId}`);
    } catch {
      // Inline FieldError renders below the action group.
    }
  };

  return (
    <Flex
      direction={{ base: 'column', sm: 'row' }}
      gap="6"
      align={{ base: 'center', sm: 'flex-start' }}
      justify="space-between"
    >
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="6"
        align={{ base: 'center', sm: 'center' }}
        flex="1"
        minW="0"
      >
        <Box
          flexShrink={0}
          w={{ base: '20', sm: '25' }}
          h={{ base: '20', sm: '25' }}
        >
          <Image
            src="/default-avatar.webp"
            alt={profile.fullName}
            width={100}
            height={100}
            unoptimized
          />
        </Box>

        <Stack
          gap="2"
          flex="1"
          minW="0"
          textAlign={{ base: 'center', sm: 'left' }}
        >
          <Heading
            as="h1"
            size={{ base: 'xl', md: '2xl' }}
            fontWeight="bold"
            lineHeight="1.2"
          >
            {profile.fullName}
          </Heading>

          {academicSubtitle ? (
            <Text textStyle="md" color="fg.muted">
              {academicSubtitle}
            </Text>
          ) : null}

          <Flex
            gap="3"
            flexWrap="wrap"
            justify={{ base: 'center', sm: 'flex-start' }}
            align="center"
            pt="0.5"
          >
            <Badge
              variant="subtle"
              colorPalette={getAvailabilityPalette(profile.availabilityStatus)}
            >
              {tAvailability(profile.availabilityStatus)}
            </Badge>

            {profile.orcidId ? (
              <Link
                href={`https://orcid.org/${profile.orcidId}`}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="xs"
                color="fg.muted"
                layerStyle="researchTextLink"
              >
                {`ORCID · ${profile.orcidId}`}
                <Icon as={ExternalLink} boxSize="3" aria-hidden />
              </Link>
            ) : null}

            {profile.googleScholarUrl ? (
              <Link
                href={profile.googleScholarUrl}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="xs"
                color="fg.muted"
                layerStyle="researchTextLink"
              >
                Google Scholar
                <Icon as={ExternalLink} boxSize="3" aria-hidden />
              </Link>
            ) : null}

            {profile.scopusAuthorId ? (
              <Link
                href={`https://www.scopus.com/authid/detail.uri?authorId=${profile.scopusAuthorId}`}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="xs"
                color="fg.muted"
                layerStyle="researchTextLink"
              >
                {`Scopus · ${profile.scopusAuthorId}`}
                <Icon as={ExternalLink} boxSize="3" aria-hidden />
              </Link>
            ) : null}
          </Flex>
        </Stack>
      </Flex>

      {isOwner && onEdit ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          flexShrink={0}
          alignSelf={{ base: 'stretch', sm: 'flex-start' }}
        >
          <Pencil />
          {t('editProfile')}
        </Button>
      ) : social.canInteract ? (
        <Stack
          gap="1.5"
          align={{ base: 'stretch', sm: 'flex-end' }}
          flexShrink={0}
          alignSelf={{ base: 'stretch', sm: 'flex-start' }}
        >
          <Flex gap="2" justify={{ base: 'center', sm: 'flex-end' }}>
            <FollowButton
              entityType="RESEARCHER"
              entityId={profile.userId}
              align="flex-end"
            />

            <Button
              variant="outline"
              size="sm"
              loading={social.isStartingChat}
              onClick={() => void handleMessage()}
            >
              <Mail />
              {t('message')}
            </Button>
          </Flex>

          {social.chatFailed ? (
            <FieldError>{t('messageError')}</FieldError>
          ) : null}
        </Stack>
      ) : null}
    </Flex>
  );
}
