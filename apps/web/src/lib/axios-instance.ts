import Axios, { type AxiosRequestConfig } from 'axios';

export const AXIOS_INSTANCE = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

/**
 * Unwraps one level of the API envelope.
 *
 * The backend wraps every successful response in
 * `{ success, data, message }`. Orval generates the operation with the
 * *envelope* type as its generic parameter — for example
 * `axiosInstance<HealthStatusDtoEnvelope>(...)` — so this conditional type
 * is what turns the wire type back into the payload type the caller wants.
 *
 * Because Orval infers the hook's `TData` from the operation's return type,
 * `query.data` is the payload (`HealthStatusDto`), not the envelope.
 */
export type Unwrap<T> = T extends { data: infer D } ? D : T;

/**
 * The shape of a successful API response.
 */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
}

/**
 * True when a body looks like an API envelope rather than a bare payload.
 *
 * This lets the frontend accept both the old (raw) and the new (enveloped)
 * backend during a deploy window, where the two are not rolled out at the
 * same time.
 *
 * Note that `success` and `data` are effectively reserved names for API
 * payloads: a business DTO that happens to have both fields would be
 * unwrapped one level too far.
 */
export function isEnvelope(body: unknown): body is ApiEnvelope<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body &&
    typeof (body as { success: unknown }).success === 'boolean'
  );
}

export const axiosInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<Unwrap<T>> => {
  const source = Axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data: body }) => {
    // Failed requests never reach this point: axios rejects on a 4xx/5xx
    // before the response is handed over, so the error body keeps its full
    // envelope — `message`, `statusCode`, `path` and `timestamp` stay
    // readable through `error.response.data`.
    const payload = isEnvelope(body) ? body.data : body;
    return payload as Unwrap<T>;
  });

  // Lets react-query cancel in-flight requests on unmount / refetch.
  // @ts-expect-error keep Orval's expected cancel contract
  promise.cancel = () => {
    source.cancel('Query was cancelled');
  };

  return promise;
};
