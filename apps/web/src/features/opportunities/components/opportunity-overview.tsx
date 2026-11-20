'use client';

import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { Opportunity } from '../types';

/**
 * The opportunity's main column.
 *
 * The description is the body of the call, the expected role says what
 * the applicant would do, and the tags say what they would need to know.
 */
export function OpportunityOverview({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  const t = useTranslations('opportunities');

  return (
    <Stack gap="4">
      <Box bg="bg.panel" boxShadow="xs">
        <Box
          px={{ base: '4', md: '6' }}
          py="4"
          borderBottomWidth="1px"
          borderColor="border"
        >
          <Heading as="h2" size="md" fontWeight="bold">
            {t('aboutTitle')}
          </Heading>
        </Box>

        <Box p={{ base: '4', md: '6' }}>
          {opportunity.description ? (
            <Text
              textStyle="sm"
              color="fg.muted"
              lineHeight="1.6"
              whiteSpace="pre-wrap"
            >
              {opportunity.description}
            </Text>
          ) : (
            <Text textStyle="sm" color="fg.muted">
              {t('noDescription')}
            </Text>
          )}
        </Box>
      </Box>

      {opportunity.expectedRole ? (
        <Box bg="bg.panel" boxShadow="xs">
          <Box
            px={{ base: '4', md: '6' }}
            py="4"
            borderBottomWidth="1px"
            borderColor="border"
          >
            <Heading as="h2" size="md" fontWeight="bold">
              {t('roleTitle')}
            </Heading>
          </Box>
          <Box p={{ base: '4', md: '6' }}>
            <Text textStyle="sm" color="fg.muted" lineHeight="1.6">
              {opportunity.expectedRole}
            </Text>
          </Box>
        </Box>
      ) : null}

      {opportunity.requiredExpertiseTags.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs">
          <Box
            px={{ base: '4', md: '6' }}
            py="4"
            borderBottomWidth="1px"
            borderColor="border"
          >
            <Heading as="h2" size="md" fontWeight="bold">
              {t('expertiseTitle')}
            </Heading>
          </Box>
          <Box p={{ base: '4', md: '6' }}>
            <Flex gap="2" flexWrap="wrap">
              {opportunity.requiredExpertiseTags.map((tag) => (
                <Text
                  key={tag}
                  textStyle="sm"
                  color="fg.muted"
                  px="2.5"
                  py="1"
                  bg="bg.muted"
                  borderRadius="md"
                >
                  {tag}
                </Text>
              ))}
            </Flex>
          </Box>
        </Box>
      ) : null}
    </Stack>
  );
}
