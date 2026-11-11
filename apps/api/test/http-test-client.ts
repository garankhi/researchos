import { Agent } from 'node:http';
import supertest from 'supertest';

export function createHttpTestClient() {
  // Retire idle connections before the test server's keep-alive timeout.
  const agent = new Agent({ keepAlive: true, timeout: 2_000 });
  return {
    request(server: Parameters<typeof supertest>[0]) {
      return supertest.agent(server).use((req) => {
        req.agent(agent);
      });
    },
    close() {
      agent.destroy();
    },
  };
}
