import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../dist/app.module.js';
import { MAIL_PROVIDER } from '../../dist/modules/notifications/mail-provider.js';

let nextRequest = 0;
const pending = new Map();
process.on('message', ({ requestId, outcome }) => {
  pending.get(requestId)?.(outcome);
  pending.delete(requestId);
});

const app = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(MAIL_PROVIDER)
  .useValue({
    send(mail) {
      const requestId = nextRequest++;
      return new Promise((resolve) => {
        pending.set(requestId, resolve);
        process.send({ ...mail, requestId });
      });
    },
  })
  .compile();

await app.init();
process.on('disconnect', async () => {
  await app.close();
});
