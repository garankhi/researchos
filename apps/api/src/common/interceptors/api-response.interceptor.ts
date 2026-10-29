import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Wraps every successful response in the API envelope.
 *
 * This interceptor is the single place where the success shape is decided,
 * so controllers keep returning their payload directly and never build the
 * envelope by hand.
 *
 * It deliberately leaves a few cases alone:
 *
 * - A payload that is already an envelope is passed through untouched, so
 *   double wrapping cannot happen.
 * - `null` and `undefined` payloads become `data: null` rather than being
 *   skipped, because the envelope's `data` field is always present.
 */
@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, { success: true; data: T; message: string }>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ success: true; data: T; message: string }> {
    return next.handle().pipe(
      map(
        (payload): { success: true; data: T; message: string } => {
          if (isEnvelope(payload)) {
            return {
              success: true,
              data: payload.data as T,
              message: payload.message,
            };
          }

          return {
            success: true,
            // A controller that returns nothing produces `data: null`. The
            // cast keeps the declared type `T`; the runtime value is still
            // null, which is what the OpenAPI schema describes.
            data: (payload ?? null) as T,
            message: '',
          };
        },
      ),
    );
  }
}

/**
 * True when the payload already looks like an envelope.
 *
 * Guards against double wrapping when an endpoint returns an envelope
 * explicitly, or when an interceptor is registered twice.
 */
function isEnvelope(body: unknown): body is {
  success: boolean;
  data: unknown;
  message: string;
} {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body &&
    typeof (body as { success: unknown }).success === 'boolean'
  );
}
