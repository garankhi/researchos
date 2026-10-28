import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * The error body returned for every failed request.
 *
 * It is the error half of the API envelope: `success` is always false and
 * `data` is always null, so a frontend can branch on `success` alone and
 * read the diagnostic fields from the top level.
 */
export interface ErrorResponseBody {
  success: false;
  data: null;
  message: string;
  statusCode: number;
  path: string;
  timestamp: string;
  errors?: Array<{ field: string; messages: string[] }>;
}

/**
 * Global exception filter.
 *
 * Cross-cutting concern: it knows nothing about the business domain, so it
 * belongs in `common/` rather than in any feature module. It gives every
 * failed request the same JSON shape, which lets the generated frontend
 * client treat failures uniformly.
 *
 * The filter runs before the response interceptor, so a thrown exception
 * never reaches the success envelope logic — the two never overlap.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponseBody = {
      success: false,
      data: null,
      message: this.resolveMessage(exception),
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    const errors = this.resolveFieldErrors(exception);
    if (errors) {
      body.errors = errors;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return payload;
      }

      const message = (payload as { message?: unknown }).message;

      if (typeof message === 'string') {
        return message;
      }

      if (Array.isArray(message)) {
        return message.join('; ');
      }
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Internal server error';
  }

  /**
   * Extracts field-level validation errors from a `BadRequestException`.
   *
   * NestJS's validation pipe rejects with a response shaped like
   * `{ statusCode, message: string[], error }`. Splitting the messages back
   * out by field gives the frontend something it can render next to the
   * offending input.
   */
  private resolveFieldErrors(
    exception: unknown,
  ): Array<{ field: string; messages: string[] }> | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }

    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return undefined;
    }

    const message = (payload as { message?: unknown }).message;

    if (!Array.isArray(message)) {
      return undefined;
    }

    const grouped = new Map<string, string[]>();

    for (const entry of message) {
      if (typeof entry !== 'string') {
        continue;
      }

      // NestJS formats validation messages as "field must be a string".
      // The field name is the first word sequence before the constraint.
      const match = /^(\S+)\s+(.*)$/.exec(entry);
      const field = match?.[1] ?? 'body';
      const detail = match?.[2] ?? entry;

      const bucket = grouped.get(field) ?? [];
      bucket.push(detail);
      grouped.set(field, bucket);
    }

    if (grouped.size === 0) {
      return undefined;
    }

    return [...grouped.entries()].map(([field, messages]) => ({
      field,
      messages,
    }));
  }
}
