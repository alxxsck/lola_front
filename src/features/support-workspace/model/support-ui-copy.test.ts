import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const roots = [
  join(process.cwd(), "src/pages"),
  join(process.cwd(), "src/features"),
  join(process.cwd(), "src/widgets/layout"),
];

const supportSource =
  /(?:^|\/)(?:AppShell\.vue|Support[^/]*\.vue|LivePage\.vue|EndUserCasesPage\.vue|support-[^/]+\/.*\.(?:vue|ts)|conversation-surface\/ui\/.*\.vue|end-user-cases\/ui\/.*\.vue|support-external-work-mock-source\.ts)$/;

const forbiddenCopy = [
  "Support content",
  "Support settings",
  "Support operations",
  "Support Workspace временно выключен",
  "Lead Control",
  "External Work",
  "browser notifications",
  "bounded filters",
  "Remote status",
  "Next action",
  "remote object",
  "Case-scoped receipts",
  "Manual resolution",
  "Remote evidence",
  "Support context",
  "Connection health",
  "Authoritative connection",
  "Site / account",
  "Capability proof",
  "Проверить connection",
  ">Claimant<",
  "Нет активного claimant",
  "Presence ещё не подключён",
  "Product Profile",
  "Backend продукта",
  "Macro v",
  "policy v",
  "Macros поддержки",
  ">External Work<",
  "Support macros",
  "Macro ещё не опубликован",
  "Case ID",
  "Conversation ID",
  "Message ID",
  "End User ID",
  "Team ID",
  "Ревизия политики",
  "Источник · v",
  "safe-context preview",
  "server evidence",
  "authoritative receipt",
  "authoritative state",
  "authoritative root",
  "retryable intent",
  "exact replay/reconcile",
  "Mutation receipt",
  "Новые intent",
  "mapping draft",
  "Server preview",
  "Сохранить draft",
  "rollback macro",
  "Case-риски",
  "operational alerts",
  "capacity risks",
  "protected Activity",
  "HTTP 202 остаётся pending",
  "Обновить evidence",
  "Разобрать UNKNOWN",
  "safe context",
  "Email requester",
  "Имя requester",
  "HelpDesk ticket",
  "Remote item ID",
  "Provider correlation",
  "Audit note",
  "Истёк lease",
  "Зарезервировано routing-системой",
  "только Support",
  "audit trail",
  "опубликованного macro revision",
  "Кейс #",
  "статус кейса",
  "Состояние кейса",
  "CMS operator",
  "Routing worker",
  "Backend-команда",
  "Текущий Project",
  "Control plane",
  "authoritative refresh",
  "Provider outcome",
  "Tier 2",
  "Support lead",
  "generation {{",
  "Найти macro",
  "Загрузка macros",
  "Подходящих macros",
];

const forbiddenPatterns = [
  /["'`][^"'`\r\n]*[А-Яа-яЁё][^"'`\r\n]*(?:\bpending\b|\bunknown\b|\bevidence\b|external work)[^"'`\r\n]*["'`]/giu,
  /["'`][^"'`\r\n]*(?:\bpending\b|\bunknown\b|\bevidence\b|external work)[^"'`\r\n]*[А-Яа-яЁё][^"'`\r\n]*["'`]/giu,
];

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

describe("Support UI copy", () => {
  it("uses the agreed Russian operator vocabulary", () => {
    const violations = roots
      .flatMap(filesIn)
      .filter(
        (file) =>
          supportSource.test(file) &&
          !file.endsWith(".test.ts") &&
          (!file.includes("/api/") ||
            file.endsWith("support-external-work-mock-source.ts")),
      )
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const phraseViolations = forbiddenCopy
          .filter((phrase) => source.includes(phrase))
          .map(
            (phrase) => `${file.replace(`${process.cwd()}/`, "")}: ${phrase}`,
          );
        const patternViolations = forbiddenPatterns.flatMap((pattern) =>
          [...source.matchAll(pattern)].map(
            (match) => `${file.replace(`${process.cwd()}/`, "")}: ${match[0]}`,
          ),
        );
        return [...phraseViolations, ...patternViolations];
      });

    expect(violations).toEqual([]);
  });
});
