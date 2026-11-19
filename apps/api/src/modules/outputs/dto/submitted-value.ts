import type { TransformFnParams } from 'class-transformer';

export function submittedValue({ obj, key }: TransformFnParams): unknown {
  return (obj as Record<string, unknown>)[key];
}

/** Read the original value before implicit conversion can coerce it to text. */
export function trimText(params: TransformFnParams): unknown {
  const value = submittedValue(params);
  return typeof value === 'string' ? value.trim() : value;
}
