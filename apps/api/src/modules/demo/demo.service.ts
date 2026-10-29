import { Injectable } from '@nestjs/common';

@Injectable()
export class DemoService {
  getGreeting(): string {
    return 'Hello World!';
  }
}
