import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpdateDigestPreferencesDto } from './digest.dto.js';

describe('digest preference validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: UpdateDigestPreferencesDto,
    });

  it('preserves an explicit opt-out and accepts an IANA zone and supported language', async () => {
    const patch = {
      enabled: false,
      timezone: 'Asia/Ho_Chi_Minh',
      language: 'vi',
    };
    await expect(validate(patch)).resolves.toMatchObject(patch);
    await expect(validate({})).resolves.toMatchObject({});
  });

  it.each([
    { enabled: 'false' },
    { enabled: null },
    { timezone: 'Not/A_Timezone' },
    { language: 'fr' },
    { userId: 'other-user' },
  ])('rejects invalid preference patches %j', async (patch) => {
    await expect(validate(patch)).rejects.toBeInstanceOf(BadRequestException);
  });
});
