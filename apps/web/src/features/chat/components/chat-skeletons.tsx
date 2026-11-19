'use client';

import { Box, Container, Flex, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

const conversationRowLayout: SkeletonResult = {
  name: 'chat-conversation-row',
  viewportWidth: 390,
  width: 340,
  height: 60,
  bones: [
    [0, 10, 12, 40, 0],
    [16, 10, 56, 16, 0],
    [78, 10, 18, 12, 0],
    [16, 34, 72, 14, 0],
  ],
};

const messageBubbleLeftLayout: SkeletonResult = {
  name: 'chat-message-left',
  viewportWidth: 768,
  width: 520,
  height: 68,
  bones: [
    [0, 4, 8, 36, 0],
    [11, 4, 32, 14, 0],
    [11, 26, 78, 38, 0],
  ],
};

const messageBubbleRightLayout: SkeletonResult = {
  name: 'chat-message-right',
  viewportWidth: 768,
  width: 520,
  height: 54,
  bones: [[28, 4, 72, 44, 0]],
};

const chatWorkspaceMobileLayout: SkeletonResult = {
  name: 'chat-workspace-mobile',
  viewportWidth: 390,
  width: 390,
  height: 460,
  bones: [
    [0, 0, 100, 52, 0],
    [0, 68, 100, 64, 0],
    [0, 144, 100, 64, 0],
    [0, 220, 100, 64, 0],
    [0, 296, 100, 64, 0],
  ],
};

const chatWorkspaceDesktopLayout: SkeletonResult = {
  name: 'chat-workspace-desktop',
  viewportWidth: 1024,
  width: 1180,
  height: 560,
  bones: [
    [0, 0, 29, 560, 0],
    [31, 0, 69, 56, 0],
    [31, 72, 48, 64, 0],
    [52, 152, 48, 52, 0],
    [31, 220, 54, 64, 0],
    [31, 496, 69, 64, 0],
  ],
};

export function ConversationListSkeleton() {
  return (
    <Stack gap="2" p="3">
      <DelayedSkeleton layout={conversationRowLayout} />
      <DelayedSkeleton layout={conversationRowLayout} announce={false} />
      <DelayedSkeleton layout={conversationRowLayout} announce={false} />
      <DelayedSkeleton layout={conversationRowLayout} announce={false} />
    </Stack>
  );
}

export function MessageHistorySkeleton() {
  return (
    <Stack gap="4" p="4">
      <DelayedSkeleton layout={messageBubbleLeftLayout} />
      <Flex justify="end">
        <DelayedSkeleton layout={messageBubbleRightLayout} announce={false} />
      </Flex>
      <DelayedSkeleton layout={messageBubbleLeftLayout} announce={false} />
    </Stack>
  );
}

export function ChatWorkspaceSkeleton() {
  return (
    <Container maxW="7xl" py="4">
      <Box hideFrom="lg">
        <DelayedSkeleton layout={chatWorkspaceMobileLayout} />
      </Box>
      <Box hideBelow="lg">
        <DelayedSkeleton layout={chatWorkspaceDesktopLayout} />
      </Box>
    </Container>
  );
}
