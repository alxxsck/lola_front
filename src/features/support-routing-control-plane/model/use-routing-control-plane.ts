import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import { ApiError, normalizeApiError } from "@/shared/api/http/api-error";
import { routingControlPlaneSource } from "../api/routing-control-plane-source";
import type {
  PolicyDraft,
  QueueDraft,
  RoutingControlPlaneSource,
  RoutingDecisionDetail,
  RoutingDecision,
  RoutingWorkspaceSnapshot,
  ShadowRun,
  WorkforceConfiguration,
} from "./routing-control-plane";

export interface RoutingAuthorityContext {
  projectId: Ref<string | undefined>;
  actorId: Ref<string | undefined>;
  permissionRevision: Ref<string>;
  canRead: Ref<boolean>;
  canReadRouting: Ref<boolean>;
  canReadTeams: Ref<boolean>;
  canReadAvailability: Ref<boolean>;
  canReadQueues: Ref<boolean>;
  canManageRouting: Ref<boolean>;
  canManageTeams: Ref<boolean>;
  canManageQueues: Ref<boolean>;
}

interface PendingIntent {
  key: string;
  fingerprint: string;
}

function message(error: ApiError): string {
  const byCode: Record<string, string> = {
    SUPPORT_ROUTING_ROUTE_PRIORITY_IN_USE:
      "Этот приоритет уже занят. Каталог перечитан, черновик сохранён.",
    SUPPORT_ROUTING_CONFIGURATION_NOT_READY:
      "Сервер обнаружил блокирующие условия. Исправьте их на шкале готовности.",
    VERSION_CONFLICT:
      "Состояние изменилось на сервере. Данные перечитаны, локальная форма сохранена.",
    IDEMPOTENCY_KEY_REUSED:
      "Сервер отклонил ключ команды с другим содержимым.",
  };
  if (error.status === 428) return "Для действия требуется повторное подтверждение личности.";
  return byCode[error.code ?? ""] ?? error.message ?? "Не удалось выполнить действие.";
}

export function useRoutingControlPlane(
  authority: RoutingAuthorityContext,
  source: RoutingControlPlaneSource = routingControlPlaneSource,
) {
  const snapshot = shallowRef<RoutingWorkspaceSnapshot | null>(null);
  const decisions = ref<RoutingDecision[]>([]);
  const decisionNextCursor = ref<string | null>(null);
  const selectedDecision = shallowRef<RoutingDecisionDetail | null>(null);
  const shadowRun = shallowRef<ShadowRun | null>(null);
  const shadowDecisionIds = ref<string[]>([]);
  const revisions = ref<Awaited<ReturnType<RoutingControlPlaneSource["revisions"]>>>([]);
  const revisionDiff = shallowRef<Awaited<ReturnType<RoutingControlPlaneSource["revisionDiff"]>> | null>(null);
  const auditEvents = ref<Awaited<ReturnType<RoutingControlPlaneSource["audit"]>>>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const announcement = ref("");
  const generation = ref(0);
  const pending = new Map<string, PendingIntent>();
  let controller: AbortController | null = null;
  const auxiliary = new Set<AbortController>();

  const scope = () => ({
    projectId: authority.projectId.value,
    actorId: authority.actorId.value,
    permissionRevision: authority.permissionRevision.value,
    generation: generation.value,
  });
  const current = (captured: ReturnType<typeof scope>) =>
    captured.projectId === authority.projectId.value &&
    captured.actorId === authority.actorId.value &&
    captured.permissionRevision === authority.permissionRevision.value &&
    captured.generation === generation.value &&
    authority.canRead.value;

  function purge(clearProtected = true): void {
    controller?.abort();
    controller = null;
    for (const active of auxiliary) active.abort();
    auxiliary.clear();
    generation.value += 1;
    if (clearProtected) {
      snapshot.value = null;
      decisions.value = [];
      decisionNextCursor.value = null;
      selectedDecision.value = null;
      shadowRun.value = null;
      shadowDecisionIds.value = [];
      revisions.value = [];
      revisionDiff.value = null;
      auditEvents.value = [];
      error.value = null;
      pending.clear();
    }
    loading.value = false;
    saving.value = false;
  }

  async function load(preserveSnapshot = false): Promise<void> {
    purge(!preserveSnapshot);
    if (!authority.projectId.value || !authority.canRead.value) return;
    const captured = scope();
    const active = new AbortController();
    controller = active;
    loading.value = true;
    try {
      const [nextSnapshot, nextDecisionPage] = await Promise.all([
        source.load(captured.projectId!, {
          teams: authority.canReadTeams.value,
          teamsManage: authority.canManageTeams.value,
          availability: authority.canReadAvailability.value,
          queues: authority.canReadQueues.value,
          routing: authority.canReadRouting.value,
        }, active.signal),
        authority.canReadRouting.value
          ? source.listDecisions(captured.projectId!, active.signal)
          : Promise.resolve({ items: [], nextCursor: null }),
      ]);
      if (!current(captured) || active.signal.aborted) return;
      snapshot.value = nextSnapshot;
      decisions.value = nextDecisionPage.items;
      decisionNextCursor.value = nextDecisionPage.nextCursor;
    } catch (cause) {
      if (active.signal.aborted || !current(captured)) return;
      const apiError = normalizeApiError(cause);
      if (apiError.status === 403 || apiError.status === 404) purge();
      else error.value = message(apiError);
    } finally {
      if (current(captured)) loading.value = false;
    }
  }

  function commandContext(intent: string, payload: unknown, actionEtag?: string) {
    const fingerprint = JSON.stringify(payload);
    const existing = pending.get(intent);
    if (existing && existing.fingerprint !== fingerprint)
      throw new Error("Команда уже ожидает подтверждения сервера");
    const value = existing ?? { key: crypto.randomUUID(), fingerprint };
    pending.set(intent, value);
    return { actionEtag, idempotencyKey: value.key };
  }

  async function command(
    permission: "ROUTING" | "TEAMS" | "QUEUES",
    intent: string,
    payload: unknown,
    action: (projectId: string, context: ReturnType<typeof commandContext>) => Promise<void>,
  ): Promise<boolean> {
    const allowed =
      permission === "ROUTING"
        ? authority.canManageRouting.value
        : permission === "TEAMS"
          ? authority.canManageTeams.value
          : authority.canManageQueues.value;
    const projectId = authority.projectId.value;
    if (!projectId || !allowed) return false;
    const captured = scope();
    saving.value = true;
    error.value = null;
    try {
      const context = commandContext(intent, payload, (payload as { actionEtag?: string })?.actionEtag);
      await action(projectId, context);
      if (!current(captured)) return false;
      pending.delete(intent);
      announcement.value = "Изменения подтверждены сервером";
      saving.value = false;
      await load(true);
      return true;
    } catch (cause) {
      if (!current(captured)) return false;
      const apiError = normalizeApiError(cause);
      error.value = message(apiError);
      if (apiError.status === 403 || apiError.status === 404) purge();
      else if (apiError.status === 409 || apiError.status === 428) {
        // The server returned a definitive OCC/precondition outcome. A retry
        // after authority refresh is a new attempt with the new ETag.
        pending.delete(intent);
        saving.value = false;
        await load(true);
      } else if (apiError.status > 0 && apiError.status < 500) {
        // Validation and other typed 4xx responses are definitive: the server
        // did not accept this intent. Let the corrected payload start a new
        // command, while retaining the key only for network/timeout/5xx ambiguity.
        pending.delete(intent);
      }
      return false;
    } finally {
      if (
        captured.projectId === authority.projectId.value &&
        captured.actorId === authority.actorId.value &&
        captured.permissionRevision === authority.permissionRevision.value
      ) saving.value = false;
    }
  }

  async function inspectDecision(decisionId: string): Promise<void> {
    const projectId = authority.projectId.value;
    if (!projectId || !authority.canRead.value) return;
    const captured = scope();
    try {
      const detail = await source.decision(projectId, decisionId);
      if (current(captured)) selectedDecision.value = detail;
    } catch (cause) {
      if (current(captured)) error.value = message(normalizeApiError(cause));
    }
  }

  async function hydrateResource(kind: "QUEUE" | "POLICY", id: string): Promise<void> {
    const projectId = authority.projectId.value;
    if (!projectId || !authority.canRead.value || !snapshot.value) return;
    const captured = scope();
    try {
      const item = kind === "QUEUE"
        ? await source.queue(projectId, id)
        : await source.policy(projectId, id);
      if (!current(captured) || !snapshot.value) return;
      const next = structuredClone(snapshot.value);
      if (kind === "QUEUE") {
        const index = next.queues.findIndex((value) => value.id === id);
        if (index >= 0) next.queues[index] = item as typeof next.queues[number];
      } else {
        const index = next.policies.findIndex((value) => value.id === id);
        if (index >= 0) next.policies[index] = item as typeof next.policies[number];
      }
      snapshot.value = next;
    } catch (cause) {
      if (!current(captured)) return;
      const apiError = normalizeApiError(cause);
      if (apiError.status === 403 || apiError.status === 404) purge();
      else error.value = message(apiError);
    }
  }

  async function loadMoreCatalog(kind: "teams" | "skills" | "operators" | "queues" | "slots"): Promise<void> {
    const projectId = authority.projectId.value;
    const value = snapshot.value;
    const cursor = value?.catalogCursors[kind];
    if (!projectId || !value || !cursor) return;
    const captured = scope();
    const active = new AbortController();
    auxiliary.add(active);
    try {
      const page = await source.loadMoreCatalog(
        projectId,
        kind,
        cursor,
        active.signal,
        authority.canManageTeams.value,
        authority.canReadAvailability.value,
      );
      if (!current(captured) || active.signal.aborted || !snapshot.value) return;
      const next = structuredClone(snapshot.value);
      if (kind === "operators") next.operators.push(...page.items as typeof next.operators);
      else if (kind === "queues") next.queues.push(...page.items as typeof next.queues);
      else if (kind === "slots") {
        next.slots.push(...page.items as typeof next.slots);
        if (page.actionEtag) next.slotActionEtag = page.actionEtag;
      } else next[kind].push(...page.items as typeof next.teams);
      next.catalogCursors[kind] = page.nextCursor;
      snapshot.value = next;
    } finally {
      auxiliary.delete(active);
    }
  }

  async function loadMoreDecisions(): Promise<void> {
    const projectId = authority.projectId.value;
    if (!projectId || !decisionNextCursor.value || !authority.canReadRouting.value) return;
    const captured = scope();
    const active = new AbortController();
    auxiliary.add(active);
    try {
      const page = await source.listDecisions(projectId, active.signal, decisionNextCursor.value);
      if (!current(captured) || active.signal.aborted) return;
      decisions.value.push(...page.items);
      decisionNextCursor.value = page.nextCursor;
    } finally {
      auxiliary.delete(active);
    }
  }

  const api = {
    createTeam: (code: string, name: string) =>
      command("TEAMS", "create-team", { code, name }, (projectId, context) => source.createTeam(projectId, { code, name }, context)),
    createSkill: (code: string, name: string, kind: "GENERAL" | "SAFETY" | "CHANNEL") =>
      command("TEAMS", "create-skill", { code, name, kind }, (projectId, context) => source.createSkill(projectId, { code, name, kind }, context)),
    renameIdentity: (kind: "TEAM" | "SKILL", id: string, name: string, expectedVersion: number) =>
      command("TEAMS", `rename:${kind}:${id}`, { name, expectedVersion }, (projectId, context) => source.renameIdentity(projectId, kind, id, { name, expectedVersion }, context)),
    archiveIdentity: (kind: "TEAM" | "SKILL", id: string, expectedVersion: number, reason: string) =>
      command("TEAMS", `archive:${kind}:${id}`, { expectedVersion, reason }, (projectId, context) => source.archiveIdentity(projectId, kind, id, { expectedVersion, reason }, context)),
    saveWorkforce: (configuration: WorkforceConfiguration) => {
      const actionEtag = snapshot.value?.workforce.actionEtag;
      return command("TEAMS", "save-workforce", { configuration, actionEtag }, (projectId, context) => source.saveWorkforce(projectId, configuration, context));
    },
    discardWorkforce: () => {
      const actionEtag = snapshot.value?.workforce.actionEtag;
      return command("TEAMS", "discard-workforce", { actionEtag }, (projectId, context) => source.discardWorkforce(projectId, context));
    },
    publishWorkforce: () => {
      const actionEtag = snapshot.value?.workforce.actionEtag;
      return command("TEAMS", "publish-workforce", { actionEtag }, (projectId, context) => source.publishWorkforce(projectId, context));
    },
    createQueue: (code: string, draft: QueueDraft) =>
      command("QUEUES", "create-queue", { code, draft }, (projectId, context) => source.createQueue(projectId, code, draft, context)),
    saveQueue: (queueId: string, draft: QueueDraft) => {
      const actionEtag = snapshot.value?.queues.find((item) => item.id === queueId)?.actionEtag;
      return command("QUEUES", `save-queue:${queueId}`, { draft, actionEtag }, (projectId, context) => source.saveQueue(projectId, queueId, draft, context));
    },
    publishQueue: (queueId: string) => {
      const actionEtag = snapshot.value?.queues.find((item) => item.id === queueId)?.actionEtag;
      return command("QUEUES", `publish-queue:${queueId}`, { actionEtag }, (projectId, context) => source.publishQueue(projectId, queueId, context));
    },
    createPolicy: (code: string, draft: PolicyDraft) =>
      command("ROUTING", "create-policy", { code, draft }, (projectId, context) => source.createPolicy(projectId, code, draft, context)),
    previewQueue: async (queueId: string, sampleLimit = 10) => {
      const projectId = authority.projectId.value;
      if (!projectId) return null;
      const captured = scope();
      const active = new AbortController();
      auxiliary.add(active);
      try {
        const result = await source.previewQueue(projectId, queueId, sampleLimit, active.signal);
        return !active.signal.aborted && current(captured) ? result : null;
      } finally {
        auxiliary.delete(active);
      }
    },
    savePolicy: (policyId: string, draft: PolicyDraft) => {
      const actionEtag = snapshot.value?.policies.find((item) => item.id === policyId)?.actionEtag;
      return command("ROUTING", `save-policy:${policyId}`, { draft, actionEtag }, (projectId, context) => source.savePolicy(projectId, policyId, draft, context));
    },
    publishPolicy: (policyId: string) => {
      const actionEtag = snapshot.value?.policies.find((item) => item.id === policyId)?.actionEtag;
      return command("ROUTING", `publish-policy:${policyId}`, { actionEtag }, (projectId, context) => source.publishPolicy(projectId, policyId, context));
    },
    bind: (queueId: string, policyId: string, routePriority: number) => {
      const actionEtag = snapshot.value?.slots.find((item) => item.queueId === queueId)?.actionEtag ?? snapshot.value?.slotActionEtag;
      return command("ROUTING", `bind:${queueId}`, { policyId, routePriority, actionEtag }, (projectId, context) => source.bind(projectId, queueId, policyId, routePriority, context));
    },
    runShadow: async (limit = 50) => {
      const projectId = authority.projectId.value;
      if (!projectId || !authority.canManageRouting.value) return false;
      const captured = scope();
      const context = commandContext("shadow-run", { limit });
      saving.value = true;
      try {
        const result = await source.runShadow(projectId, limit, context);
        if (!current(captured)) return false;
        let terminal = result;
        for (let attempt = 0; attempt < 30 && (terminal.state === "QUEUED" || terminal.state === "RUNNING"); attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          if (!current(captured)) return false;
          terminal = await source.shadowRun(projectId, result.id);
        }
        if (!current(captured)) return false;
        shadowRun.value = terminal;
        if (terminal.state === "COMPLETED" || terminal.state === "COMPLETED_WITH_ERRORS") {
          const decisionIds = await source.shadowRunDecisionIds(projectId, result.id);
          if (current(captured) && decisionIds.length) {
            shadowDecisionIds.value = decisionIds;
            announcement.value = `Теневой прогон завершён: ${decisionIds.length} решений связано с запуском`;
          }
        }
        pending.delete("shadow-run");
        return true;
      } catch (cause) {
        if (current(captured)) error.value = message(normalizeApiError(cause));
        return false;
      } finally {
        if (current(captured)) saving.value = false;
      }
    },
    activate: (queueId: string, targetMode: "DISABLED" | "OFFER" | "AUTO_ASSIGN", reasonCode: string) => {
      const expected = snapshot.value?.readiness.find((item) => item.queueId === queueId)?.activation?.version ?? 0;
      return command("ROUTING", `activate:${queueId}`, { targetMode, reasonCode, expected }, (projectId, context) => source.activate(projectId, queueId, targetMode, expected, reasonCode, context));
    },
    loadRevisions: async (kind: "QUEUE" | "POLICY" | "WORKFORCE", resourceId?: string) => {
      const projectId = authority.projectId.value;
      if (!projectId) return;
      const captured = scope();
      const active = new AbortController();
      auxiliary.add(active);
      const nextRevisions = await source.revisions(projectId, kind, resourceId, active.signal);
      const nextDiff = nextRevisions.length > 1
        ? await source.revisionDiff(projectId, kind, nextRevisions[1]!.id, nextRevisions[0]!.id, resourceId, active.signal)
        : null;
      auxiliary.delete(active);
      if (!active.signal.aborted && current(captured)) {
        revisions.value = nextRevisions;
        revisionDiff.value = nextDiff;
      }
    },
    restoreRevision: (kind: "QUEUE" | "POLICY" | "WORKFORCE", revisionId: string, resourceId?: string) =>
      command(kind === "QUEUE" ? "QUEUES" : kind === "WORKFORCE" ? "TEAMS" : "ROUTING", `restore:${kind}:${revisionId}`, { revisionId, resourceId }, (projectId, context) => source.restoreRevision(projectId, kind, revisionId, resourceId, "OPERATOR_REQUEST", context)),
    loadAudit: async (resourceType: "SUPPORT_QUEUE" | "SUPPORT_QUEUE_ROUTING" | "SUPPORT_ROUTING_POLICY" | "SUPPORT_WORKFORCE", resourceId: string) => {
      const projectId = authority.projectId.value;
      if (!projectId) return;
      const captured = scope();
      const active = new AbortController();
      auxiliary.add(active);
      const next = await source.audit(projectId, resourceType, resourceId, active.signal);
      auxiliary.delete(active);
      if (!active.signal.aborted && current(captured)) auditEvents.value = next;
    },
  };

  watch(
    [authority.projectId, authority.actorId, authority.permissionRevision, authority.canRead, authority.canReadRouting, authority.canReadTeams, authority.canReadAvailability, authority.canReadQueues],
    () => void load(),
    { immediate: true },
  );
  onBeforeUnmount(purge);

  return {
    snapshot,
    decisions,
    decisionNextCursor,
    selectedDecision,
    shadowRun,
    shadowDecisionIds,
    revisions,
    revisionDiff,
    auditEvents,
    loading,
    saving,
    error,
    announcement,
    hasBlockingReadiness: computed(() => snapshot.value?.readiness.some((item) => item.status !== "READY") ?? false),
    reload: () => load(false),
    hydrateQueue: (queueId: string) => hydrateResource("QUEUE", queueId),
    hydratePolicy: (policyId: string) => hydrateResource("POLICY", policyId),
    loadMoreCatalog,
    loadMoreDecisions,
    inspectDecision,
    closeDecision: () => { selectedDecision.value = null; },
    ...api,
  };
}
