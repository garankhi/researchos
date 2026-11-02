import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { codeForStatus } from '../errors/error-codes.js';

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
  /**
   * The error code, e.g. `opportunity_not_found`.
   *
   * A code, not a sentence: the wording lives in the frontend's message
   * catalog, so the server never sends English to a user. The frontend
   * reads it through `apiErrorCode()` and resolves it with
   * `resolveErrorCode()`.
   */
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
      message: this.resolveCode(exception, status),
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

  /**
   * Resolves the code that describes this failure.
   *
   * An exception that carries a code — a `CodedHttpException`, or any
   * `HttpException` whose message is a code — names the failure itself.
   * That is the domain code a module raises when it knows more than the
   * status does.
   *
   * Everything else falls back to the generic code for the status, so
   * `message` is always a code the frontend catalog can resolve.
   *
   * The code is read from the exception's `message`, which is where Nest
   * puts the response body's `message`. Reading it from there rather than
   * from a separate property means the two can never disagree.
   */
  private resolveCode(exception: unknown, status: number): string {
    const message = this.exceptionMessage(exception);

    if (message && this.looksLikeCode(message)) {
      return message;
    }

    return codeForStatus(status);
  }

  /**
   * The exception's own message, if it has one.
   */
  private exceptionMessage(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }

    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return payload;
    }

    const message = (payload as { message?: unknown }).message;

    if (typeof message === 'string') {
      return message;
    }

    return undefined;
  }

  /**
   * True when a message looks like an error code rather than prose.
   *
   * A code is `snake_case`: lower-case letters, digits and underscores.
   * Nest's built-in exceptions carry sentences (`"Opportunity not found"`),
   * and a sentence must not become the code — the frontend would try to
   * resolve it as a catalog key and fail.
   *
   * The check is deliberately narrow. A message that is not a code falls
   * back to the generic code for the status.
   */
  private looksLikeCode(message: string): boolean {
    return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(message);
  }

  /**
   * Extracts field-level validation errors from a `BadRequestException`.
   *
   * The global `ValidationPipe` runs in the `grouped` error format, so the
   * exception's `message` is a `Record<string, string[]>` keyed by the
   * property path — `title`, `items.0.name`, ... — with each message being
   * the code the validator decorator carried.
   *
   * Nest groups the messages by field, so the frontend can render each one
   * next to the input that caused it.
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

    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return undefined;
    }

    const grouped: Array<{ field: string; messages: string[] }> = [];

    for (const [field, messages] of Object.entries(message)) {
      if (!Array.isArray(messages)) {
        continue;
      }

      const codes = messages.filter(
        (entry): entry is string => typeof entry === 'string',
      );

      if (codes.length === 0) {
        continue;
      }

      grouped.push({ field, messages: codes });
    }

    if (grouped.length === 0) {
      return undefined;
    }

    return grouped;
  }
}
