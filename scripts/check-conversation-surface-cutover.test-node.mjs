import assert from "node:assert/strict";
import test from "node:test";

import { findConversationSurfaceCutoverViolations } from "./check-conversation-surface-cutover.mjs";

const canonicalSurface = {
  path: "src/features/conversation-surface/ui/ConversationSurface.vue",
  source:
    '<TranslatedMessageBody /><div aria-label="Режим отображения сообщений" />',
};
const productionRoots = [
  canonicalSurface,
  {
    path: "src/features/end-user-workspace/UserConversationPane.vue",
    source: "<ConversationSurface />",
  },
  {
    path: "src/features/support-conversation/ui/SupportConversationPane.vue",
    source: "<ConversationSurface />",
  },
];

test("cutover verification accepts the canonical Surface and its adapters", () => {
  const violations = findConversationSurfaceCutoverViolations(productionRoots);

  assert.deepEqual(violations, []);
});

test("cutover verification rejects legacy chat components and Case message feeds", () => {
  const violations = findConversationSurfaceCutoverViolations([
    ...productionRoots,
    {
      path: "src/features/support-reply/ui/SupportReplyComposer.vue",
      source: '<section class="support-reply-composer" />',
    },
    {
      path: "src/features/support-conversation/ui/SupportMessageDeliveryStatus.vue",
      source: '<span class="delivery-status" />',
    },
    {
      path: "src/features/end-user-cases/ui/EndUserCaseDetail.vue",
      source: '<article class="message-row">full chat copy</article>',
    },
  ]);

  assert.deepEqual(
    violations.map(({ rule }) => rule),
    [
      "legacy-component",
      "legacy-selector",
      "legacy-component",
      "case-message-renderer",
    ],
  );
});

test("cutover verification rejects a second message renderer or translation toggle", () => {
  const violations = findConversationSurfaceCutoverViolations([
    ...productionRoots,
    {
      path: "src/pages/AnotherChat.vue",
      source:
        '<TranslatedMessageBody /><div aria-label="Режим отображения сообщений" />',
    },
  ]);

  assert.deepEqual(
    violations.map(({ rule }) => rule),
    ["duplicate-message-renderer", "duplicate-translation-toggle"],
  );
});

test("cutover verification requires the canonical Surface and both adapters", () => {
  const violations = findConversationSurfaceCutoverViolations([
    productionRoots[0],
    productionRoots[1],
  ]);

  assert.deepEqual(violations, [
    {
      path: "src/features/support-conversation/ui/SupportConversationPane.vue",
      rule: "required-production-root",
      detail: "the canonical Surface and both production adapters must exist",
    },
  ]);
});
