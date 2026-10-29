# Envelope typing verification

Date: 2026-10-29
Branch: `verify/envelope-typing`

## Question

Can the frontend unwrap the API envelope at the transport layer (the Orval
mutator) so that `query.data` stays the payload type `T`, with no changes to
existing screens or domain hooks?

## Verdict

**Yes.** Verified end to end against the real `apps/api/openapi.json`.

## What was verified

The chain tested: `apps/api/openapi.json` -> envelope transform -> Orval ->
mutator -> TypeScript inference.

1. **Orval generates named envelope models** from a transformed spec.
   `$ref: '#/components/schemas/HealthStatusDtoEnvelope'` becomes
   `src/lib/api/models/healthStatusDtoEnvelope.ts`:

   ```typescript
   export interface HealthStatusDtoEnvelope {
     success: boolean;
     data: HealthStatusDto;
     message: string;
   }
   ```

   The full envelope type is retained and exported, including `success` and
   `message`.

2. **The mutator's conditional return type resolves through Orval's
   generated chain.** The generated operation has no explicit return type:

   ```typescript
   export const healthControllerCheck = (options?, signal?) => {
     return axiosInstance<HealthStatusDtoEnvelope>(
       { url: `/health`, method: 'GET', signal },
       options,
     );
   };
   ```

   With `axiosInstance` declared as `<T>(...) => Promise<Unwrap<T>>` and
   `type Unwrap<T> = T extends { data: infer D } ? D : T`, the inferred type
   is `Promise<HealthStatusDto>`. Orval's hook infers `TData` from
   `Awaited<ReturnType<typeof healthControllerCheck>>`, so `query.data` is
   `HealthStatusDto`.

3. **The whole app type-checks with zero changes to existing code.** With the
   candidate mutator swapped in and the client regenerated from the
   transformed spec, `tsc --noEmit -p tsconfig.json` reported no errors in
   `src/`. The following kept working untouched:

   - `apps/web/src/features/health/hooks/use-api-health.ts` — `query.data.status`
   - `apps/web/src/app/demo/_components/api-section.tsx` — `slow.data`, `health.data?.status`

4. **Negative case confirmed.** Removing the `@ts-expect-error` on
   `Unwrap<HealthStatusDto>` produced a compile error, so `Unwrap` does not
   match a non-envelope payload.

5. **`void` payloads are untouched.** `/demo/fail` has no response schema, so
   Orval keeps `axiosInstance<void>` and `Unwrap<void>` stays `void`.

6. **The tolerant mutator behaves correctly at runtime.** `isEnvelope` was
   tested against enveloped bodies, raw object payloads, raw strings,
   `null`/`undefined`, a body missing `data`, and a body where `success` is
   not a boolean.

## Findings that shape the implementation

### `String` shadows the global type

A `type: string` payload becomes its own component, and Orval emits
`src/lib/api/models/string.ts`:

```typescript
export type String = string;
```

and the envelope references it:

```typescript
export interface StringEnvelope {
  success: boolean;
  data: String;
  message: string;
}
```

`export * from './string'` in the models barrel means a wildcard import of the
barrel would shadow the global `String`. Nothing in `src/` wildcard-imports
the barrel today (consumers import named symbols from `@/lib/api`), so this
is safe for now, but it is a real footgun.

Mitigation: prefer named component names over primitive type names in the
transform, or keep primitive payloads as inline schemas rather than
promoting them to components.

### A business payload with `success` and `data` fields is misdetected

`isEnvelope` matches any body with a boolean `success` and a `data` key. A
DTO with those exact field names would be unwrapped one level too far.

Mitigation: document `success` and `data` as reserved names for API
envelope payloads.

### The transform must be idempotent

Running the transform twice would double-wrap. The prototype guards against
this by checking whether the schema is already a `$ref` to the matching
`*Envelope` component.

## Conclusion

Option B (unwrap in the mutator) is viable and costs zero changes in existing
frontend code. The envelope type is still generated and exported, so the
wire shape remains discoverable in `src/lib/api/models/`.

Recommended next step: implement the backend side (interceptor + filter +
transform in `apps/api/src/common/`), then regenerate the spec and client.
