/**
 * Mention token parsing and formatting utilities shared between backend and frontend.
 *
 * Canonical wire token format inside `body`:
 * - Individual participant mention: `@[Display Name](uuid)`
 * - Conversation-wide mention (authorized roles only): `@all`
 */

const USER_MENTION_PATTERN =
  /@\[([^\]]{1,255})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

const ALL_MENTION_PATTERN = /(?:^|[\s(])@all(?=$|[\s.,!?;:)])/i;

export interface ParsedMentions {
  /** Distinct mentioned participant user IDs in appearance order (lowercase UUIDs). */
  userIds: string[];
  /** Whether the message includes an `@all` conversation-wide mention token. */
  mentionsAll: boolean;
}

export interface ChatMentionSegment {
  kind: "text" | "user" | "all";
  text: string;
  userId?: string;
  displayName?: string;
}

/** Formats a user mention token for insertion into message body text. */
export function formatUserMentionToken(
  displayName: string,
  userId: string,
): string {
  const safeName = displayName.replace(/[\[\]]/g, "").trim() || "User";
  return `@[${safeName}](${userId.toLowerCase()})`;
}

/** Extracts distinct user mention UUIDs and `@all` presence from a message body. */
export function parseMentionTokens(body: string): ParsedMentions {
  if (!body) {
    return { userIds: [], mentionsAll: false };
  }

  const seen = new Set<string>();
  const userIds: string[] = [];

  for (const match of body.matchAll(USER_MENTION_PATTERN)) {
    const id = match[2]?.toLowerCase();
    if (id && !seen.has(id)) {
      seen.add(id);
      userIds.push(id);
    }
  }

  const stripped = body.replace(USER_MENTION_PATTERN, " ");
  const mentionsAll = ALL_MENTION_PATTERN.test(stripped);

  return { userIds, mentionsAll };
}

/**
 * Splits a message body into renderable text and mention segments so the UI
 * can highlight `@Display Name` and `@all` tokens cleanly without raw HTML.
 */
export function tokenizeMessageBody(body: string): ChatMentionSegment[] {
  if (!body) {
    return [];
  }

  const combined =
    /@\[([^\]]{1,255})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)|((?:^|[\s(]))(@all)(?=$|[\s.,!?;:)])/gi;

  const segments: ChatMentionSegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(combined)) {
    const matchIndex = match.index ?? 0;

    if (match[1] !== undefined && match[2] !== undefined) {
      if (matchIndex > cursor) {
        segments.push({ kind: "text", text: body.slice(cursor, matchIndex) });
      }
      segments.push({
        kind: "user",
        text: `@${match[1]}`,
        displayName: match[1],
        userId: match[2].toLowerCase(),
      });
      cursor = matchIndex + match[0].length;
    } else if (match[4] !== undefined) {
      const prefix = match[3] ?? "";
      const allStart = matchIndex + prefix.length;
      if (allStart > cursor) {
        segments.push({ kind: "text", text: body.slice(cursor, allStart) });
      }
      segments.push({ kind: "all", text: "@all" });
      cursor = allStart + match[4].length;
    }
  }

  if (cursor < body.length) {
    segments.push({ kind: "text", text: body.slice(cursor) });
  }

  return segments;
}
