import { defineConfig } from 'orval';

// Reads ../api/openapi.json — regenerate it with `pnpm --filter api openapi`
// (or `turbo run openapi`), then regenerate the client with `pnpm --filter web orval`.
export default defineConfig({
  api: {
    input: '../api/openapi.json',
    output: {
      target: './src/lib/api/client.ts',
      schemas: './src/lib/api/models',
      client: 'react-query',
      httpClient: 'axios',
      mode: 'tags-split',
      clean: true,
      formatter: 'prettier',
      override: {
        mutator: {
          path: './src/lib/axios-instance.ts',
          name: 'axiosInstance',
        },
        query: {
          // Orval picks the hook shape from the HTTP verb: `GET` becomes a
          // `useQuery` hook, `POST`/`PATCH`/`DELETE` become `useMutation`
          // hooks. Setting `useQuery: true` globally would force writes to
          // be generated as query hooks — cached, with no `mutate` and no
          // `onSuccess`/`onError` mutation callbacks.
          signal: true,
        },
      },
    },
  },
});
