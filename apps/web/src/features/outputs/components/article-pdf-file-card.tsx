import type { ReactNode } from 'react';
import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import { useFormatter } from 'next-intl';
import { ArticleIllustration } from './article-illustration';

export function ArticlePdfFileCard({
  file,
  children,
}: {
  file: { name: string; size: number };
  children?: ReactNode;
}) {
  const format = useFormatter();
  return (
    <Flex align="center" gap="3" wrap="wrap" borderWidth="1px" p="3">
      <HStack gap="3" flex="1 1 11rem" minW="0">
        <Box flexShrink="0">
          <ArticleIllustration kind="pdf-file" />
        </Box>
        <Box minW="0">
          <Text fontWeight="semibold" overflowWrap="anywhere">
            {file.name}
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {format.number(file.size / 1024, { maximumFractionDigits: 1 })} KiB
          </Text>
        </Box>
      </HStack>
      {children}
    </Flex>
  );
}
