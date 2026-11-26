import { Module } from '@nestjs/common';
import {
  FileAccessGrantsController,
  FileAccessRequestsController,
  FileAccessSubmitController,
} from './file-access.controller.js';
import { FileAccessService } from './file-access.service.js';

/**
 * Requests for, decisions on, and grants of access to one exact Private
 * output file (RES-176). Downloads stay in the storage module; they read the
 * grants through the shared SQL policy `can_view_output_file`.
 */
@Module({
  controllers: [
    FileAccessSubmitController,
    FileAccessRequestsController,
    FileAccessGrantsController,
  ],
  providers: [FileAccessService],
})
export class FileAccessModule {}
