'use client';

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Link2,
  Pencil,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { initialsOf } from '../utils/initials';
import type {
  ProfileResponseDto,
  ProfileResponseDtoAvailabilityStatus,
} from '../types';

function getAvailabilityPalette(
  status: ProfileResponseDtoAvailabilityStatus,
): 'green' | 'blue' | 'purple' | 'orange' | 'gray' {
  switch (status) {
    case 'OPEN_FOR_COLLABORATION':
      return 'green';
    case 'SEEKING_GROUP':
      return 'blue';
    case 'MENTORING_ONLY':
      return 'purple';
    case 'LIMITED_AVAILABILITY':
      return 'orange';
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

  const titlesAndDegrees = [profile.academicTitle, profile.academicDegree]
    .filter(Boolean)
    .join(', ');

  return (
    <Box bg="bg.panel" borderWidth="1px" p={{ base: '4', md: '6' }}>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="6"
        align={{ base: 'center', sm: 'flex-start' }}
      >
        <Flex
          align="center"
          justify="center"
          w={{ base: '20', sm: '25' }}
          h={{ base: '20', sm: '25' }}
          flexShrink={0}
          bg="colorPalette.solid"
          color="colorPalette.contrast"
          fontSize={{ base: 'xl', sm: '2xl' }}
          fontWeight="semibold"
        >
          {initialsOf(profile.fullName)}
        </Flex>

        <Stack
          gap="3"
          flex="1"
          minW="0"
          textAlign={{ base: 'center', sm: 'left' }}
        >
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            gap="3"
            align={{ base: 'center', sm: 'center' }}
            justify="space-between"
            flexWrap="wrap"
          >
            <Box>
              <Heading as="h1" size="lg" fontWeight="bold">
                {profile.fullName}
              </Heading>
              {titlesAndDegrees ? (
                <Text textStyle="md" color="fg.muted">
                  {titlesAndDegrees}
                </Text>
              ) : null}
            </Box>

            {isOwner && onEdit ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                alignSelf={{ base: 'stretch', sm: 'flex-start' }}
              >
                <Pencil />
                {t('editProfile')}
              </Button>
            ) : null}
          </Flex>

          <Text textStyle="sm" color="fg.muted">
            {profile.departmentUnit} • {profile.email}
          </Text>

          <Flex
            gap="2"
            flexWrap="wrap"
            justify={{ base: 'center', sm: 'flex-start' }}
            align="center"
          >
            <Badge
              variant="outline"
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
              >
                <CheckCircle2 />
                {`ORCID: ${profile.orcidId}`}
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
              >
                <GraduationCap />
                Google Scholar
                <ExternalLink />
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
              >
                <Link2 />
                {`Scopus: ${profile.scopusAuthorId}`}
              </Link>
            ) : null}
          </Flex>

          {profile.bio ? (
            <Text textStyle="sm" pt="1" whiteSpace="pre-line">
              {profile.bio}
            </Text>
          ) : null}
        </Stack>
      </Flex>
    </Box>
  );
}
