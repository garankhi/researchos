'use client';

import {
  Avatar,
  Box,
  Flex,
  Heading,
  Link,
  Popover,
  Portal,
  Stack,
  Text,
  VisuallyHidden,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import NextLink from '@/components/ui/link';
import { isPreviewable } from '../entity-types';
import type { PreviewableEntityType } from '../entity-types';
import { useEntityPreview } from '../hooks/use-entity-preview';
import { EntityPreviewSkeleton } from './entity-preview-skeletons';

/**
 * How long the pointer has to rest on a link before the card opens.
 *
 * A card that opens the instant the pointer crosses a link gets in the
 * way of reading the page. A short pause is the reader saying "I want
 * to know more about this".
 */
const openDelayMs = 350;

/**
 * How long the card stays open after the pointer leaves it.
 *
 * The pause lets the pointer travel from the link into the card without
 * the card closing underneath it.
 */
const closeDelayMs = 150;

/**
 * The preview of a group: its name, its scope and its directions.
 */
function GroupCard({ groupId }: { groupId: string }) {
  const t = useTranslations('entityPreview');
  const { preview, isFailed } = useEntityPreview('GROUP', groupId, true);

  if (isFailed) {
    return (
      <Text textStyle="sm" color="fg.muted">
        {t('unavailable')}
      </Text>
    );
  }

  if (!preview || preview.kind !== 'GROUP') {
    return <EntityPreviewSkeleton entityType="GROUP" />;
  }

  const { name, description, directions } = preview;

  return (
    <Stack gap="3">
      <Box minW="0">
        <Heading as="h3" size="sm" fontWeight="bold" truncate>
          {name}
        </Heading>
        <Text textStyle="xs" color="fg.muted">
          {t('directionCount', { count: directions.length })}
        </Text>
      </Box>

      {description ? (
        <Text
          textStyle="sm"
          color="fg.muted"
          lineClamp={3}
          lineHeight="1.55"
          overflowWrap="anywhere"
        >
          {description}
        </Text>
      ) : null}

      {directions.length > 0 ? (
        <Stack gap="2" minW="0">
          {directions.map((direction) => (
            <Box key={direction.title} minW="0">
              <Text
                textStyle="xs"
                fontWeight="semibold"
                color="fg"
                lineClamp={1}
                overflowWrap="anywhere"
              >
                {direction.title}
              </Text>
              {direction.topic ? (
                <Text
                  textStyle="xs"
                  color="fg.muted"
                  lineClamp={1}
                  overflowWrap="anywhere"
                >
                  {direction.topic}
                </Text>
              ) : null}
            </Box>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

/**
 * The preview of a researcher: their name, their unit and their bio.
 */
function ResearcherCard({ userId }: { userId: string }) {
  const t = useTranslations('entityPreview');
  const { preview, isFailed } = useEntityPreview('RESEARCHER', userId, true);

  if (isFailed) {
    return (
      <Text textStyle="sm" color="fg.muted">
        {t('unavailable')}
      </Text>
    );
  }

  if (!preview || preview.kind !== 'RESEARCHER') {
    return <EntityPreviewSkeleton entityType="RESEARCHER" />;
  }

  const {
    fullName,
    departmentUnit,
    academicTitle,
    academicDegree,
    bio,
    avatarStorageKey,
  } = preview;
  const subtitle = [departmentUnit, academicTitle, academicDegree]
    .filter(Boolean)
    .join(' · ');

  return (
    <Stack gap="3">
      <Flex align="center" gap="2.5" minW="0">
        <Avatar.Root size="md" flexShrink={0}>
          {avatarStorageKey ? (
            <Avatar.Image
              src={avatarStorageKey}
              alt={fullName}
              width={40}
              height={40}
            />
          ) : null}
          <Avatar.Fallback name={fullName} />
        </Avatar.Root>
        <Box minW="0">
          <Heading as="h3" size="sm" fontWeight="bold" truncate>
            {fullName}
          </Heading>
          {subtitle ? (
            <Text textStyle="xs" color="fg.muted" truncate>
              {subtitle}
            </Text>
          ) : null}
        </Box>
      </Flex>

      {bio ? (
        <Text
          textStyle="sm"
          color="fg.muted"
          lineClamp={3}
          lineHeight="1.55"
          overflowWrap="anywhere"
        >
          {bio}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * The card that opens when the reader hovers a link to a group or a
 * researcher.
 */
function EntityPreviewCard({
  entityType,
  entityId,
}: {
  entityType: PreviewableEntityType;
  entityId: string;
}) {
  return (
    <Box minW="0">
      {entityType === 'GROUP' ? (
        <GroupCard groupId={entityId} />
      ) : (
        <ResearcherCard userId={entityId} />
      )}
    </Box>
  );
}

/**
 * A link to an entity, with a hover card that shows quick information
 * about it.
 *
 * This is the one place that knows how a link to a group or a researcher
 * behaves, so every screen that mentions one gets the same preview
 * without repeating the wiring.
 *
 * A link to an entity with no preview — an output, an opportunity — is
 * a plain link, so a caller never has to know which kinds have one.
 *
 * @param entityType The kind of entity the link points at.
 * @param entityId The entity's id.
 * @param href The path of the entity's screen.
 * @param children The link's content.
 */
export function EntityLink({
  entityType,
  entityId,
  href,
  children,
}: {
  entityType: string;
  entityId: string;
  href: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('entityPreview');
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // A timer that outlives the component would set state on an unmounted
  // link, so every pending timer is dropped when the link goes away.
  useEffect(() => clearTimers, [clearTimers]);

  const scheduleOpen = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current) return;

    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setIsOpen(true);
    }, openDelayMs);
  }, []);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) return;

    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setIsOpen(false);
    }, closeDelayMs);
  }, []);

  if (!isPreviewable(entityType)) {
    return (
      <Link asChild>
        <NextLink href={href}>{children}</NextLink>
      </Link>
    );
  }

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(details) => setIsOpen(details.open)}
      positioning={{ placement: 'bottom-start', gutter: 8 }}
      closeOnInteractOutside={false}
      /*
       * The card is mounted only while it is open. A link on a page that
       * nobody has hovered yet costs nothing — no query, no request — and
       * a screen that renders a link without a query provider still
       * works, because the provider is only needed once the card opens.
       */
      lazyMount
      unmountOnExit
    >
      <Popover.Anchor asChild>
        <Link
          asChild
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          onFocus={scheduleOpen}
          onBlur={scheduleClose}
        >
          <NextLink href={href}>{children}</NextLink>
        </Link>
      </Popover.Anchor>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            boxShadow="overlayPanel"
            p="4"
            bg="bg.panel"
            borderWidth="1px"
            borderColor="border"
            /*
             * The card has a fixed width and never grows past it. A long
             * unbroken title or topic path wraps inside the card instead
             * of stretching it past the edge of the viewport.
             */
            w="20rem"
            maxW="calc(100vw - 2rem)"
            overflowWrap="anywhere"
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
          >
            {/*
             * The card is a dialog, and a dialog needs a name. The title
             * is hidden — the card names itself visually — but it gives a
             * screen reader something to announce.
             */}
            <Popover.Title>
              <VisuallyHidden>
                {entityType === 'GROUP'
                  ? t('groupPreviewTitle')
                  : t('researcherPreviewTitle')}
              </VisuallyHidden>
            </Popover.Title>
            <EntityPreviewCard entityType={entityType} entityId={entityId} />
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
