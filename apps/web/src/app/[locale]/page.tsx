import { Box, Container, Heading } from '@chakra-ui/react';
import { getTranslations } from 'next-intl/server';
import { ResearchFeed } from './_components/research-feed';

export default async function Home() {
  const t = await getTranslations('home');

  return (
    <Box as="main" bg="bg.subtle" flex="1">
      <Container
        maxW="46rem"
        px={{ base: '3', md: '4' }}
        py={{ base: '4', md: '8' }}
      >
        <Heading as="h1" size="xl" mb="4">
          {t('title')}
        </Heading>
        <ResearchFeed />
      </Container>
    </Box>
  );
}
