/**
 * Initials calculation for profile avatars.
 */
export function initialsOf(fullName: string): string {
  const words = fullName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return '';
  }

  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : '';

  const firstInitial = Array.from(first)[0] ?? '';
  const lastInitial = Array.from(last)[0] ?? '';

  return (firstInitial + lastInitial).toUpperCase();
}
