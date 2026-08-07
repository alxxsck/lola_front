import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const canonicalSurfacePath =
  "src/features/conversation-surface/ui/ConversationSurface.vue";
const legacyComponentNames = new Set([
  "SupportMessageDeliveryStatus.vue",
  "SupportReplyComposer.vue",
]);
const requiredAdapters = new Set([
  "src/features/end-user-workspace/UserConversationPane.vue",
  "src/features/support-conversation/ui/SupportConversationPane.vue",
]);
const legacySelectors = [
  ".message-bubble",
  ".message-history",
  ".message-log",
  ".message-view-toggle",
  ".support-reply-composer",
];

export function findConversationSurfaceCutoverViolations(entries) {
  const violations = [];
  const productionPaths = new Set(
    entries.map((entry) => entry.path.split(path.sep).join("/")),
  );

  for (const entry of entries) {
    const normalizedPath = entry.path.split(path.sep).join("/");
    const filename = path.posix.basename(normalizedPath);
    const add = (rule, detail) =>
      violations.push({ path: normalizedPath, rule, detail });

    if (legacyComponentNames.has(filename))
      add("legacy-component", `${filename} must be removed after cutover`);

    if (
      normalizedPath ===
        "src/features/end-user-cases/ui/EndUserCaseDetail.vue" &&
      /(?:class=["'][^"']*\bmessage-row\b|\.message-row\b)/u.test(
        entry.source,
      )
    )
      add(
        "case-message-renderer",
        "Case detail may expose evidence links, not a message feed",
      );

    if (
      legacySelectors.some(
        (selector) =>
          entry.source.includes(selector) ||
          entry.source.includes(selector.slice(1)),
      )
    )
      add(
        "legacy-selector",
        "legacy full-chat selector remains in production source",
      );

    if (
      normalizedPath !== canonicalSurfacePath &&
      /<TranslatedMessageBody\b/u.test(entry.source)
    )
      add(
        "duplicate-message-renderer",
        "TranslatedMessageBody is owned by ConversationSurface",
      );

    if (
      normalizedPath !== canonicalSurfacePath &&
      /aria-label=["']Режим отображения сообщений["']/u.test(entry.source)
    )
      add(
        "duplicate-translation-toggle",
        "the original/translated toggle is owned by ConversationSurface",
      );

    if (
      requiredAdapters.has(normalizedPath) &&
      !/<ConversationSurface\b/u.test(entry.source)
    )
      add(
        "adapter-root",
        "Users and Support adapters must mount ConversationSurface",
      );
  }

  for (const requiredPath of [canonicalSurfacePath, ...requiredAdapters]) {
    if (!productionPaths.has(requiredPath))
      violations.push({
        path: requiredPath,
        rule: "required-production-root",
        detail: "the canonical Surface and both production adapters must exist",
      });
  }

  return violations;
}

async function productionVueEntries(rootDir = repositoryRoot) {
  const sourceRoot = path.join(rootDir, "src");
  const files = await readdir(sourceRoot, { recursive: true });
  const vueFiles = files
    .filter((file) => file.endsWith(".vue"))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    vueFiles.map(async (file) => ({
      path: path.posix.join("src", file.split(path.sep).join("/")),
      source: await readFile(path.join(sourceRoot, file), "utf8"),
    })),
  );
}

export async function checkConversationSurfaceCutover(
  rootDir = repositoryRoot,
) {
  return findConversationSurfaceCutoverViolations(
    await productionVueEntries(rootDir),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await checkConversationSurfaceCutover();
  if (violations.length) {
    for (const violation of violations)
      console.error(
        `${violation.path}: ${violation.rule}: ${violation.detail}`,
      );
    process.exitCode = 1;
  } else {
    console.log("Conversation Surface cutover check passed");
  }
}
