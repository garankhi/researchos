import type {
  ApplicationResponseDto,
  CandidateWorkDto,
  OutputResponseDto,
  ProfileInterestResponseDto,
  ProfileResponseDto,
  ProfileResponseDtoAvailabilityStatus,
  ResearchGroupResponseDto,
  UpdateProfileDto,
} from '@/lib/api/models';

export type ProfileTab =
  | 'overview'
  | 'outputs'
  | 'groups'
  | 'interests'
  | 'following'
  | 'applications'
  | 'openalex';

export type PublicProfileTab = 'overview' | 'outputs' | 'groups' | 'interests';

export type {
  ApplicationResponseDto,
  CandidateWorkDto,
  OutputResponseDto,
  ProfileInterestResponseDto,
  ProfileResponseDto,
  ProfileResponseDtoAvailabilityStatus,
  ResearchGroupResponseDto,
  UpdateProfileDto,
};
