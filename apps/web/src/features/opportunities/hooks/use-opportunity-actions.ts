'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  applicationsControllerApply,
  opportunitiesControllerOpen,
  opportunitiesControllerFill,
  opportunitiesControllerClose,
  opportunitiesControllerUpdate,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';

/**
 * The actions a caller can take on one opportunity.
 *
 * Applying is a one-off with a note, so it carries its own form state.
 * The lifecycle actions — open, fill, close, archive — belong to a
 * manager and are plain mutations.
 */
export function useOpportunityActions({
  opportunityId,
  groupId,
}: {
  opportunityId?: string;
  groupId?: string | null;
}) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => {
        if (
          groupId &&
          query.queryKey[0] === 'group-hub' &&
          query.queryKey[2] === groupId
        )
          return true;
        const key = query.queryKey[0];
        return (
          typeof key === 'string' &&
          (key === '/opportunities' ||
            key.startsWith('/opportunities/') ||
            key === '/my/applications')
        );
      },
    });
  };

  const applyMutation = useMutation({
    mutationFn: (applicantNote: string) =>
      applicationsControllerApply(opportunityId!, { applicantNote }),
    onSuccess: invalidate,
  });

  const openMutation = useMutation({
    mutationFn: () => opportunitiesControllerOpen(opportunityId!),
    onSuccess: invalidate,
  });

  const fillMutation = useMutation({
    mutationFn: () => opportunitiesControllerFill(opportunityId!),
    onSuccess: invalidate,
  });

  const closeMutation = useMutation({
    mutationFn: () => opportunitiesControllerClose(opportunityId!),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      opportunitiesControllerUpdate(opportunityId!, {
        archivedAt: new Date().toISOString(),
      }),
    onSuccess: invalidate,
  });

  return {
    /** Applies to the opportunity. */
    apply: applyMutation.mutateAsync,
    /** Whether the apply request is in flight. */
    isApplyingRequest: applyMutation.isPending,
    /** Opens the opportunity for applications. */
    open: openMutation.mutateAsync,
    /** Marks the opportunity as filled. */
    fill: fillMutation.mutateAsync,
    /** Closes the opportunity. */
    close: closeMutation.mutateAsync,
    /** Archives the opportunity. */
    archive: archiveMutation.mutateAsync,
    /** Whether any of the actions is in flight. */
    isBusy:
      applyMutation.isPending ||
      openMutation.isPending ||
      fillMutation.isPending ||
      closeMutation.isPending ||
      archiveMutation.isPending,
    /** The last error of an action, if any. */
    error:
      applyMutation.error ??
      openMutation.error ??
      fillMutation.error ??
      closeMutation.error ??
      archiveMutation.error,
    /** The status code of the last error, if any. */
    errorStatus: apiStatusCode(
      applyMutation.error ??
        openMutation.error ??
        fillMutation.error ??
        closeMutation.error ??
        archiveMutation.error,
    ),
  };
}
