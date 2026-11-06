/**
 * Collaboration availability status of a researcher.
 *
 * This indicates openness to collaboration, student mentoring, or group
 * joining. It is independent of visibility: confirmed profiles are always
 * visible to the university community.
 */
export enum AvailabilityStatusEnum {
  OPEN_FOR_COLLABORATION = 'OPEN_FOR_COLLABORATION',
  SEEKING_GROUP = 'SEEKING_GROUP',
  MENTORING_ONLY = 'MENTORING_ONLY',
  LIMITED_AVAILABILITY = 'LIMITED_AVAILABILITY',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
}
