'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import { CircleCheck, CircleMinus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import LocalizedLink from '@/components/ui/link';
import { ArticleIllustration } from './article-illustration';

type ArticleCreationSuccessProps = {
  outputId: string;
  addedAt: string;
  hasOptionalDetails: boolean;
  onAddMore: () => void;
};

export function ArticleCreationSuccess({
  outputId,
  addedAt,
  hasOptionalDetails,
  onAddMore,
}: ArticleCreationSuccessProps) {
  const t = useTranslations('articleCreationSuccess');
  const format = useFormatter();
  const DetailsIcon = hasOptionalDetails ? CircleCheck : CircleMinus;

  return (
    <Box bg="home.background" minH="100dvh" color="fg">
      <Box bg="bg.panel" borderBottomWidth="1px" px="4">
        <HStack maxW="3xl" mx="auto" py="4" gap="3">
          <ArticleIllustration kind="header" />
          <Text fontSize="xl" fontWeight="semibold">
            {t('header')}
          </Text>
        </HStack>
      </Box>
      <Box px={{ base: '3', md: '6' }} py={{ base: '4', md: '8' }}>
        <Box maxW="3xl" mx="auto" bg="bg.panel">
          <Stack
            align="center"
            textAlign="center"
            gap="4"
            p={{ base: '5', md: '10' }}
          >
            <ArticleIllustration kind="published" />
            <Heading as="h1" size={{ base: 'xl', md: '2xl' }}>
              {t('title')}
            </Heading>
            <Text>{t('visibility')}</Text>
            <Text
              as="span"
              bg="teal.subtle"
              color="teal.fg"
              px="3"
              py="1"
              fontSize="sm"
            >
              {t('addedOn', {
                date: format.dateTime(new Date(addedAt), {
                  dateStyle: 'medium',
                  timeZone: 'UTC',
                }),
              })}
            </Text>
            <HStack
              align="start"
              textAlign="start"
              gap="3"
              w="full"
              mt="3"
              p="4"
              borderWidth="1px"
            >
              <Box color="fg.muted" flexShrink="0">
                <DetailsIcon aria-hidden size={24} />
              </Box>
              <Box>
                <Text fontWeight="semibold">
                  {hasOptionalDetails ? t('detailsAdded') : t('detailsSkipped')}
                </Text>
                <Text color="fg.muted" fontSize="sm">
                  {hasOptionalDetails ? t('editHint') : t('addHint')}
                </Text>
              </Box>
            </HStack>
          </Stack>
          <Flex
            borderTopWidth="1px"
            p="4"
            gap="3"
            justify="flex-end"
            direction={{ base: 'column', sm: 'row' }}
          >
            <Button variant="outline" asChild>
              <LocalizedLink href={`/outputs/${outputId}`}>
                {t('view')}
              </LocalizedLink>
            </Button>
            <Button onClick={onAddMore}>{t('addMore')}</Button>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}
