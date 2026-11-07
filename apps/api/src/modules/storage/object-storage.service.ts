import { Injectable } from '@nestjs/common';
import { createS3Storage, type StorageAdapter } from '@researchos/storage';

@Injectable()
export class ObjectStorageService {
  private storage?: StorageAdapter;

  get adapter(): StorageAdapter {
    return (this.storage ??= createS3Storage());
  }
}
