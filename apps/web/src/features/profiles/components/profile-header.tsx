'use client';

import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link as MuiLink,
  Stack,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SchoolIcon from '@mui/icons-material/School';
import LinkIcon from '@mui/icons-material/Link';
import VerifiedIcon from '@mui/icons-material/Verified';
import { useTranslations } from 'next-intl';
import { initialsOf } from '../utils/initials';
import type {
  ProfileResponseDto,
  ProfileResponseDtoAvailabilityStatus,
} from '../types';

function getAvailabilityColor(
  status: ProfileResponseDtoAvailabilityStatus,
): 'success' | 'info' | 'primary' | 'warning' | 'default' {
  switch (status) {
    case 'OPEN_FOR_COLLABORATION':
      return 'success';
    case 'SEEKING_GROUP':
      return 'info';
    case 'MENTORING_ONLY':
      return 'primary';
    case 'LIMITED_AVAILABILITY':
      return 'warning';
    case 'NOT_AVAILABLE':
    default:
      return 'default';
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
    <Card variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={3}
          sx={{ alignItems: { xs: 'center', sm: 'flex-start' } }}
        >
          <Avatar
            sx={{
              width: { xs: 80, sm: 100 },
              height: { xs: 80, sm: 100 },
              fontSize: { xs: '1.75rem', sm: '2.25rem' },
              bgcolor: 'primary.main',
              fontWeight: 600,
            }}
          >
            {initialsOf(profile.fullName)}
          </Avatar>

          <Stack
            spacing={1.5}
            sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' } }}
          >
            <Box>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{
                  alignItems: { xs: 'center', sm: 'center' },
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <Box>
                  <Typography
                    variant="h5"
                    component="h1"
                    sx={{ fontWeight: 700 }}
                  >
                    {profile.fullName}
                  </Typography>
                  {titlesAndDegrees ? (
                    <Typography variant="subtitle1" color="text.secondary">
                      {titlesAndDegrees}
                    </Typography>
                  ) : null}
                </Box>

                {isOwner && onEdit ? (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={onEdit}
                    sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                  >
                    {t('editProfile')}
                  </Button>
                ) : null}
              </Stack>
            </Box>

            <Typography variant="body2" color="text.secondary">
              {profile.departmentUnit} • {profile.email}
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              sx={{
                flexWrap: 'wrap',
                justifyContent: { xs: 'center', sm: 'flex-start' },
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Chip
                label={tAvailability(profile.availabilityStatus)}
                color={getAvailabilityColor(profile.availabilityStatus)}
                size="small"
                variant="outlined"
              />

              {profile.orcidId ? (
                <Chip
                  icon={<VerifiedIcon fontSize="small" />}
                  label={`ORCID: ${profile.orcidId}`}
                  size="small"
                  variant="outlined"
                  component="a"
                  href={`https://orcid.org/${profile.orcidId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  clickable
                />
              ) : null}

              {profile.googleScholarUrl ? (
                <MuiLink
                  href={profile.googleScholarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: '0.8125rem',
                  }}
                >
                  <SchoolIcon fontSize="inherit" />
                  Google Scholar
                </MuiLink>
              ) : null}

              {profile.scopusAuthorId ? (
                <MuiLink
                  href={`https://www.scopus.com/authid/detail.uri?authorId=${profile.scopusAuthorId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: '0.8125rem',
                  }}
                >
                  <LinkIcon fontSize="inherit" />
                  Scopus: {profile.scopusAuthorId}
                </MuiLink>
              ) : null}
            </Stack>

            {profile.bio ? (
              <Typography
                variant="body2"
                sx={{
                  pt: 1,
                  whiteSpace: 'pre-line',
                  color: 'text.primary',
                }}
              >
                {profile.bio}
              </Typography>
            ) : null}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
