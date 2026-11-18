import { describe, expect, it } from "vitest";
import {
  CHAT_SOCKET_NAMESPACE,
  ChatClientEvent,
  ChatServerEvent,
  formatUserMentionToken,
  isAllowedChatAttachmentMime,
  isAllowedChatReaction,
  isChatImageMimeType,
  parseMentionTokens,
  tokenizeMessageBody,
} from "./index.js";

describe("@researchos/chat shared contracts", () => {
  it("exposes stable Socket.IO namespace and event enums", () => {
    expect(CHAT_SOCKET_NAMESPACE).toBe("/chat");
    expect(ChatClientEvent.SEND_MESSAGE).toBe("chat:message:send");
    expect(ChatServerEvent.MESSAGE_CREATED).toBe("chat:message:created");
  });

  it("parses distinct user mentions and @all mentions accurately", () => {
    const aliceId = "11111111-1111-4111-8111-111111111111";
    const bobId = "22222222-2222-4222-8222-222222222222";
    const tokenA = formatUserMentionToken("Alice Nguyen", aliceId);
    const tokenB = formatUserMentionToken("Bob Tran", bobId);

    const parsed = parseMentionTokens(
      `Hello ${tokenA} and ${tokenB}, repeating ${tokenA}! Also @all please check.`,
    );

    expect(parsed.userIds).toEqual([aliceId, bobId]);
    expect(parsed.mentionsAll).toBe(true);
  });

  it("does not treat email addresses as @all mentions", () => {
    const parsed = parseMentionTokens("Contact support@all.edu.vn for info");
    expect(parsed.mentionsAll).toBe(false);
    expect(parsed.userIds).toEqual([]);
  });

  it("tokenizes message bodies into text, user mention, and @all segments", () => {
    const aliceId = "11111111-1111-4111-8111-111111111111";
    const body = `Hi @[Alice](${aliceId}), ping @all!`;
    const segments = tokenizeMessageBody(body);

    expect(segments).toEqual([
      { kind: "text", text: "Hi " },
      {
        kind: "user",
        text: "@Alice",
        displayName: "Alice",
        userId: aliceId,
      },
      { kind: "text", text: ", ping " },
      { kind: "all", text: "@all" },
      { kind: "text", text: "!" },
    ]);
  });

  it("validates allowed reactions and attachment MIME types", () => {
    expect(isAllowedChatReaction("👍")).toBe(true);
    expect(isAllowedChatReaction("invalid")).toBe(false);
    expect(isAllowedChatAttachmentMime("image/webp")).toBe(true);
    expect(isChatImageMimeType("image/png")).toBe(true);
    expect(isChatImageMimeType("application/pdf")).toBe(false);
    expect(isAllowedChatAttachmentMime("application/x-msdownload")).toBe(false);
  });
});
