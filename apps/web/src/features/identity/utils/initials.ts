/**
 * The initials shown in an account's avatar.
 *
 * The backend has no avatar field, so the avatar is the initials of the
 * display name. That is enough to tell two accounts apart at a glance,
 * and it needs no image, no upload and no second request.
 *
 * ## Why the rules are what they are
 *
 * - A Vietnamese name is often two or three words (`Nguyễn Văn A`), and
 *   the *last* word is the given name — the part that identifies the
 *   person. Taking the first word alone would show the family name of
 *   every account in the system, so the initials are taken from the start
 *   and the end of the name.
 * - A name with one word gives one initial, not two of the same letter.
 * - A name with no usable characters gives an empty string, and the
 *   caller renders a neutral avatar rather than a broken one.
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

  // `Array.from` counts code points, not UTF-16 units, so an emoji or a
  // character outside the basic plane is not cut in half.
  const firstInitial = Array.from(first)[0] ?? '';
  const lastInitial = Array.from(last)[0] ?? '';

  return (firstInitial + lastInitial).toUpperCase();
}
