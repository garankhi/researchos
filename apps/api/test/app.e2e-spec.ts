import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { createHttpTestClient } from './http-test-client.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;
  const { request, close } = createHttpTestClient();

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('ok');
        expect(response.body.service).toBe('researchos-api');
      });
  });

  it('/demo/slow (GET)', () => {
    return request(app.getHttpServer())
      .get('/demo/slow?delay=10')
      .expect(200)
      .expect('Hello World!');
  });

  it('/demo/fail (GET) returns the standard error body', () => {
    return request(app.getHttpServer())
      .get('/demo/fail')
      .expect(500)
      .expect((response) => {
        expect(response.body).toMatchObject({
          statusCode: 500,
          path: '/demo/fail',
        });
        expect(typeof response.body.timestamp).toBe('string');
      });
  });

  afterEach(async () => {
    close();
    await app.close();
  });
});
