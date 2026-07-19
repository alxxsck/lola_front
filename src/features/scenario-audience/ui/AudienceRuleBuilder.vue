<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import Message from "primevue/message";
import type { SegmentSummaryResponseDto } from "@/shared/api/repository/scenario-authoring";
import {
  applyAudienceCommand,
  AUDIENCE_LIMITS,
  serializeAudienceDraft,
  summarizeAudience,
  type AudienceCommand,
  type AudienceDomainContext,
  type AudienceDraft,
  type AudienceDraftNode,
  type AudienceLeafDraftNode,
  type AudienceLeafInput,
  type AudienceLeafKind,
} from "../model";
import AudienceLeafEditor from "./AudienceLeafEditor.vue";
import AudienceNodeCard from "./AudienceNodeCard.vue";

const props = defineProps<{
  modelValue: AudienceDraft;
  context: AudienceDomainContext;
  segmentSearch?: (query: string) => Promise<SegmentSummaryResponseDto[]>;
}>();
const emit = defineEmits<{
  "update:modelValue": [draft: AudienceDraft];
  "editing-dirty": [dirty: boolean];
}>();
const sourceSession = ref<{
  parentNodeId: string;
  label: string;
  opener: HTMLElement;
} | null>(null);
const editorSession = ref<{
  kind: AudienceLeafKind;
  nodeId?: string;
  parentNodeId?: string;
  opener: HTMLElement;
} | null>(null);
const commandError = ref("");
const activeIssue = ref<{ fieldPath?: string; message: string } | null>(null);
const sourceDialog = ref<HTMLElement | null>(null);
const searchedSegments = ref<SegmentSummaryResponseDto[]>([]);
const effectiveContext = computed<AudienceDomainContext>(() => {
  const segments = new Map(
    props.context.segments.map((segment) => [segment.segmentId, segment]),
  );
  searchedSegments.value.forEach((segment) =>
    segments.set(segment.segmentId, segment),
  );
  return { ...props.context, segments: [...segments.values()] };
});
const summary = computed(() =>
  summarizeAudience(props.modelValue, effectiveContext.value),
);
const serialization = computed(() =>
  serializeAudienceDraft(props.modelValue, effectiveContext.value),
);
const isV2 = computed(() => props.context.catalog.version === 2);
const freshnessMode = computed(
  () => props.modelValue.freshness?.mode ?? "USE_LAST_KNOWN",
);
const freshnessSeconds = computed(() =>
  props.modelValue.freshness?.mode === "REQUIRE_FRESH"
    ? props.modelValue.freshness.maxAgeSeconds
    : 86_400,
);

function updateFreshness(mode: string, seconds = freshnessSeconds.value) {
  emit("update:modelValue", {
    ...props.modelValue,
    version: 2,
    freshness:
      mode === "REQUIRE_FRESH"
        ? {
            mode: "REQUIRE_FRESH",
            maxAgeSeconds: Math.max(
              1,
              Math.min(31_536_000, Math.trunc(seconds || 86_400)),
            ),
          }
        : { mode: "USE_LAST_KNOWN" },
  });
}

function findNode(
  node: AudienceDraftNode,
  nodeId: string,
): AudienceDraftNode | undefined {
  if (node.nodeId === nodeId) return node;
  if (node.kind === "all" || node.kind === "any") {
    for (const child of node.children) {
      const found = findNode(child, nodeId);
      if (found) return found;
    }
  }
  return node.kind === "not" ? findNode(node.child, nodeId) : undefined;
}

const editedNode = computed(() => {
  const node = editorSession.value?.nodeId
    ? findNode(props.modelValue.root, editorSession.value.nodeId)
    : undefined;
  return node && !["all", "any", "not", "opaque"].includes(node.kind)
    ? (node as AudienceLeafDraftNode)
    : undefined;
});

function runCommand(command: AudienceCommand) {
  const result = applyAudienceCommand(
    props.modelValue,
    command,
    effectiveContext.value,
  );
  if (!result.ok) {
    commandError.value = result.error.message;
    return false;
  }
  commandError.value = "";
  emit("update:modelValue", result.draft);
  return true;
}

function openSources(parentNodeId: string, label: string, opener: HTMLElement) {
  sourceSession.value = { parentNodeId, label, opener };
  void nextTick(() =>
    document
      .querySelector<HTMLElement>(".source-picker [data-audience-source]")
      ?.focus(),
  );
}

function closeSources() {
  const opener = sourceSession.value?.opener;
  sourceSession.value = null;
  void nextTick(() => opener?.focus());
}

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  const controls = [
    ...(container?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []),
  ];
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function chooseSource(kind: AudienceLeafKind) {
  const source = sourceSession.value;
  if (!source) return;
  editorSession.value = {
    kind,
    parentNodeId: source.parentNodeId,
    opener: source.opener,
  };
  sourceSession.value = null;
}

function edit(nodeId: string, opener: HTMLElement) {
  const node = findNode(props.modelValue.root, nodeId);
  if (
    !node ||
    ![
      "locale",
      "language",
      "country",
      "userAttribute",
      "segmentMembership",
    ].includes(node.kind)
  )
    return;
  editorSession.value = { kind: node.kind as AudienceLeafKind, nodeId, opener };
}

function applyLeaf(leaf: AudienceLeafInput) {
  const session = editorSession.value;
  if (!session) return;
  const command: AudienceCommand = session.nodeId
    ? { type: "replaceLeaf", nodeId: session.nodeId, leaf }
    : { type: "add", parentNodeId: session.parentNodeId!, leaf };
  if (!runCommand(command)) return;
  const opener = session.opener;
  editorSession.value = null;
  activeIssue.value = null;
  emit("editing-dirty", false);
  void nextTick(() => opener.focus());
}

function closeEditor() {
  const opener = editorSession.value?.opener;
  editorSession.value = null;
  activeIssue.value = null;
  emit("editing-dirty", false);
  void nextTick(() => opener?.focus());
}

async function searchSegments(query: string) {
  if (!props.segmentSearch) return [];
  const items = await props.segmentSearch(query);
  const segments = new Map(
    searchedSegments.value.map((segment) => [segment.segmentId, segment]),
  );
  items.forEach((segment) => segments.set(segment.segmentId, segment));
  searchedSegments.value = [...segments.values()];
  return items;
}

function focusIssue(issue: {
  nodeId?: string;
  fieldPath?: string;
  message?: string;
}) {
  if (!issue.nodeId) return;
  const node = findNode(props.modelValue.root, issue.nodeId);
  const opener = document.querySelector<HTMLElement>(
    `[data-audience-node="${issue.nodeId}"] article`,
  );
  if (
    !node ||
    !opener ||
    ![
      "locale",
      "language",
      "country",
      "userAttribute",
      "segmentMembership",
    ].includes(node.kind)
  )
    return;
  activeIssue.value = issue.message
    ? { fieldPath: issue.fieldPath, message: issue.message }
    : null;
  editorSession.value = {
    kind: node.kind as AudienceLeafKind,
    nodeId: node.nodeId,
    opener,
  };
  void nextTick(() => {
    const selector =
      issue.fieldPath === "definitionId"
        ? '[aria-label="Атрибут пользователя"]'
        : issue.fieldPath === "segmentId"
          ? '[aria-label="Сегмент аудитории"]'
          : issue.fieldPath === "operator"
            ? '.leaf-editor select[aria-label^="Оператор"], .leaf-editor select[aria-label^="Проверка"]'
            : '.leaf-editor [aria-label^="Значение"], .leaf-editor [aria-label="ISO-код страны"]';
    document.querySelector<HTMLElement>(selector)?.focus();
  });
}

defineExpose({ focusIssue });
</script>

<template>
  <section class="audience-builder" aria-labelledby="audience-builder-title">
    <header class="builder-header">
      <div>
        <span class="eyebrow">Аудитория</span>
        <h2 id="audience-builder-title">Кто может войти в сценарий</h2>
        <p>
          {{
            isV2
              ? "Ограничьте аудиторию по типизированным полям Current Profile или опубликованным сегментам."
              : "Ограничьте аудиторию по locale, языку, стране, типизированным атрибутам или опубликованным сегментам."
          }}
        </p>
      </div>
      <div class="health" :class="summary.status">
        <strong>{{ summary.leaves }} условий</strong
        ><span>{{
          summary.status === "empty"
            ? "Без ограничений"
            : serialization.ok
              ? "Готово к проверке"
              : "Нужно исправить"
        }}</span>
      </div>
    </header>
    <Message v-if="commandError" severity="error" :closable="false">{{
      commandError
    }}</Message>
    <div class="semantics-note">
      <i class="pi pi-shield" />
      <div>
        <strong>Отдельно от поведения</strong
        ><span
          >Audience читает текущее состояние End User. История Events и поля
          Trigger остаются на этапе «Условия».</span
        >
      </div>
    </div>
    <fieldset v-if="isV2" class="freshness">
      <legend>Какие данные считать подходящими?</legend>
      <label
        ><input
          type="radio"
          name="audience-freshness"
          value="USE_LAST_KNOWN"
          :checked="freshnessMode === 'USE_LAST_KNOWN'"
          @change="updateFreshness('USE_LAST_KNOWN')"
        /><span
          ><strong>Последние известные</strong
          ><small
            >Использовать последний принятый профиль независимо от
            возраста.</small
          ></span
        ></label
      ><label
        ><input
          type="radio"
          name="audience-freshness"
          value="REQUIRE_FRESH"
          :checked="freshnessMode === 'REQUIRE_FRESH'"
          @change="updateFreshness('REQUIRE_FRESH')"
        /><span
          ><strong>Только свежие</strong
          ><small
            >Если профиль старше лимита, результат станет «неизвестно» и
            сценарий не запустится.</small
          ></span
        ></label
      ><label v-if="freshnessMode === 'REQUIRE_FRESH'" class="age"
        ><span>Максимальный возраст, секунд</span
        ><input
          type="number"
          min="1"
          max="31536000"
          :value="freshnessSeconds"
          aria-label="Максимальный возраст профиля в секундах"
          @change="
            updateFreshness(
              'REQUIRE_FRESH',
              Number(($event.target as HTMLInputElement).value),
            )
          "
      /></label>
    </fieldset>
    <details class="policy">
      <summary>Когда и как проверяется аудитория?</summary>
      <p>
        Первое решение сохраняется в Run при старте. При включённой повторной
        проверке доставки backend применяет тот же pinned contract к текущему
        состоянию и хранит результат отдельно.
      </p>
      <p v-if="isV2">
        Отсутствующее, устаревшее или недоступное значение даёт результат
        «неизвестно». Даже внутри НЕ этот результат не становится совпадением.
      </p>
      <p v-else>
        Отсутствующее или null-значение совпадает только с проверкой «не
        заполнено».
      </p>
    </details>
    <ol class="audience-tree">
      <AudienceNodeCard
        :node="modelValue.root"
        :summary-by-node-id="summary.byNodeId"
        root
        @add-condition="openSources"
        @command="runCommand"
        @edit="edit"
      />
    </ol>
    <aside class="summary">
      <div>
        <span>Итог</span><strong>{{ summary.text }}</strong>
      </div>
      <dl>
        <div>
          <dt>Условия</dt>
          <dd>{{ summary.leaves }}</dd>
        </div>
        <div>
          <dt>Сегменты</dt>
          <dd>{{ summary.segmentLeaves }}</dd>
        </div>
        <div>
          <dt>Скрытые</dt>
          <dd>{{ summary.sensitiveLeaves }}</dd>
        </div>
      </dl>
      <small
        >Audience catalog <code>{{ effectiveContext.catalog.revision }}</code> ·
        {{ summary.nodes }}/{{ AUDIENCE_LIMITS.maxNodes }} узлов</small
      >
    </aside>
    <div
      v-if="sourceSession"
      class="source-backdrop"
      role="presentation"
      @mousedown.self="closeSources"
    >
      <section
        ref="sourceDialog"
        class="source-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audience-source-title"
        @keydown.esc="closeSources"
        @keydown.tab="trapFocus($event, sourceDialog)"
      >
        <header>
          <div>
            <span>Новый признак</span>
            <h3 id="audience-source-title">Что проверить</h3>
            <p>В группе «{{ sourceSession.label }}»</p>
          </div>
          <button
            type="button"
            aria-label="Закрыть выбор признака"
            @click="closeSources"
          >
            <i class="pi pi-times" />
          </button>
        </header>
        <div class="source-grid">
          <button
            v-if="!isV2"
            type="button"
            data-audience-source="locale"
            @click="chooseSource('locale')"
          >
            <i class="pi pi-globe" /><span
              ><strong>Locale</strong
              ><small>Точный locale проекта, например ru-RU.</small></span
            ></button
          ><button
            v-if="!isV2"
            type="button"
            data-audience-source="language"
            @click="chooseSource('language')"
          >
            <i class="pi pi-language" /><span
              ><strong>Язык</strong
              ><small>Основной язык locale: ru, en и другие.</small></span
            ></button
          ><button
            v-if="!isV2"
            type="button"
            data-audience-source="country"
            @click="chooseSource('country')"
          >
            <i class="pi pi-map-marker" /><span
              ><strong>Страна</strong
              ><small>ISO-код из профиля End User.</small></span
            ></button
          ><button
            type="button"
            data-audience-source="userAttribute"
            @click="chooseSource('userAttribute')"
          >
            <i class="pi pi-id-card" /><span
              ><strong>{{ isV2 ? "Поле Current Profile" : "Атрибут" }}</strong
              ><small
                >Типизированное поле, разрешённое backend-каталогом.</small
              ></span
            ></button
          ><button
            v-if="context.allowSegments !== false"
            type="button"
            data-audience-source="segmentMembership"
            @click="chooseSource('segmentMembership')"
          >
            <i class="pi pi-users" /><span
              ><strong>Сегмент</strong
              ><small>Точная immutable версия сегмента.</small></span
            >
          </button>
        </div>
      </section>
    </div>
    <AudienceLeafEditor
      v-if="editorSession"
      :key="`${editorSession.kind}:${editorSession.nodeId ?? 'new'}`"
      :kind="editorSession.kind"
      :node="editedNode"
      :context="effectiveContext"
      :segment-search="props.segmentSearch ? searchSegments : undefined"
      :active-issue="activeIssue ?? undefined"
      @apply="applyLeaf"
      @close="closeEditor"
      @dirty-change="emit('editing-dirty', $event)"
    />
  </section>
</template>

<style scoped>
.audience-builder {
  container: audience-builder / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 20px;
  background: var(--surface-subtle);
  color: var(--ink);
}
.builder-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.builder-header h2 {
  font-size: 1.1rem;
}
.builder-header p {
  margin: 5px 0 0;
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
.health {
  flex: 0 0 auto;
  padding: 9px 11px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  text-align: right;
}
.health strong,
.health span {
  display: block;
}
.health strong {
  font-size: 0.71rem;
}
.health span {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.62rem;
}
.health.ready {
  border-color: var(--status-success);
  background: var(--status-success-soft);
}
.health.invalid,
.health.unsupported {
  border-color: var(--status-danger);
  background: var(--status-danger-soft);
}
.semantics-note {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--status-violet);
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.semantics-note strong,
.semantics-note span {
  display: block;
}
.semantics-note strong {
  font-size: 0.7rem;
}
.semantics-note span {
  margin-top: 3px;
  font-size: 0.64rem;
  line-height: 1.4;
}
.policy {
  padding: 0 3px;
  color: var(--text-secondary);
  font-size: 0.67rem;
}
.policy summary {
  cursor: pointer;
  font-weight: 800;
}
.policy p {
  margin: 7px 0 0;
  line-height: 1.5;
}
.audience-tree {
  margin: 0;
  padding: 0;
}
.summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 14px;
  border-radius: 15px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.summary span {
  display: block;
  color: var(--text-on-emphasis-muted);
  font-size: 0.58rem;
  text-transform: uppercase;
}
.summary strong {
  display: block;
  margin-top: 4px;
  font-size: 0.7rem;
  line-height: 1.45;
}
.summary dl {
  display: flex;
  gap: 14px;
  margin: 0;
}
.summary dl div {
  text-align: right;
}
.summary dt {
  color: var(--text-on-emphasis-muted);
  font-size: 0.57rem;
}
.summary dd {
  margin: 3px 0 0;
  font-size: 0.7rem;
  font-weight: 800;
}
.summary small {
  grid-column: 1/3;
  color: var(--text-on-emphasis-muted);
  font-size: 0.6rem;
}
.summary code {
  color: var(--brand);
}
.source-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1190;
  display: grid;
  background: var(--overlay-backdrop);
  place-items: center;
  padding: 18px;
}
.source-picker {
  width: min(620px, 100%);
  padding: 20px;
  border-radius: 18px;
  background: var(--surface-card);
  box-shadow: var(--shadow-dialog);
}
.source-picker header {
  display: flex;
  justify-content: space-between;
}
.source-picker header span {
  color: var(--status-violet-text);
  font-size: 0.58rem;
  font-weight: 800;
  text-transform: uppercase;
}
.source-picker h3 {
  margin: 3px 0 0;
}
.source-picker p {
  margin: 3px 0 0;
  color: var(--text-small-muted);
  font-size: 0.64rem;
}
.source-picker header button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: var(--surface-subtle);
}
.source-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}
.source-grid > button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  text-align: left;
  cursor: pointer;
}
.source-grid > button:hover {
  border-color: var(--status-violet-text);
  background: var(--status-violet-soft);
}
.source-grid i {
  color: var(--status-violet-text);
}
.source-grid strong,
.source-grid small {
  display: block;
}
.source-grid strong {
  font-size: 0.7rem;
}
.source-grid small {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.6rem;
  line-height: 1.35;
}
@container audience-builder (max-width:520px) {
  .audience-builder {
    padding: 13px;
  }
  .builder-header {
    flex-direction: column;
  }
  .summary {
    grid-template-columns: 1fr;
  }
  .summary dl {
    justify-content: space-between;
  }
  .summary small {
    grid-column: 1;
  }
  .source-grid {
    grid-template-columns: 1fr;
  }
}
.freshness {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 13px;
  background: var(--surface-card);
}
.freshness legend {
  padding: 0 5px;
  font-size: 0.7rem;
  font-weight: 800;
}
.freshness label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  background: var(--surface-subtle);
}
.freshness strong,
.freshness small {
  display: block;
}
.freshness strong {
  font-size: 0.68rem;
}
.freshness small {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.61rem;
  line-height: 1.4;
}
.freshness .age {
  grid-column: 1/3;
  align-items: center;
}
.freshness .age span {
  font-size: 0.65rem;
  font-weight: 700;
}
.freshness .age input {
  width: 150px;
  margin-left: auto;
  padding: 7px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
}
@container audience-builder (max-width:520px) {
  .freshness {
    grid-template-columns: 1fr;
  }
  .freshness .age {
    grid-column: 1;
  }
}
</style>
