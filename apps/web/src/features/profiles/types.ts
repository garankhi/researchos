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
  'applications' | 'groups' | 'outputs' | 'interests' | 'openalex';

export type PublicProfileTab = 'groups' | 'outputs' | 'interests';

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
