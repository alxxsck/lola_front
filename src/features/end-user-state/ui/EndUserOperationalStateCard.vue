<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { endUserStateRepository } from "../api/end-user-state-repository";
import type {
  EndUserAttributeHistory,
  EndUserOperationalState,
} from "../model/end-user-state";
const props = defineProps<{
  projectId: string;
  endUserId: string;
  canManage: boolean;
}>();
const state = ref<EndUserOperationalState | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const loadedContext = ref("");
const editKey = ref("");
const raw = ref("");
const reason = ref("");
const idem = ref("");
const formError = ref("");
const history = ref<EndUserAttributeHistory | null>(null);
const historyOpen = ref(false);
const historyLoading = ref(false);
let generation = 0;
let historyGeneration = 0;
const known = computed(() => state.value?.items ?? []);
const contextKey = computed(() => `${props.projectId}:${props.endUserId}`);
const contextReady = computed(
  () => loadedContext.value === contextKey.value && Boolean(state.value),
);
watch(
  () => [props.projectId, props.endUserId] as const,
  () => {
    generation += 1;
    historyGeneration += 1;
    state.value = null;
    loadedContext.value = "";
    editKey.value = "";
    historyOpen.value = false;
    history.value = null;
    historyLoading.value = false;
    saving.value = false;
    void load();
  },
  { immediate: true },
);
watch(
  () => props.canManage,
  (canManage) => {
    if (canManage) return;
    editKey.value = "";
    saving.value = false;
    formError.value = "";
  },
);
watch(historyOpen, (open) => {
  if (open) return;
  historyGeneration += 1;
  historyLoading.value = false;
});
async function load() {
  const current = ++generation;
  const requestedProjectId = props.projectId;
  const requestedEndUserId = props.endUserId;
  const requestedContext = `${requestedProjectId}:${requestedEndUserId}`;
  loading.value = true;
  error.value = "";
  try {
    const next = await endUserStateRepository.get(
      requestedProjectId,
      requestedEndUserId,
    );
    if (
      current === generation &&
      requestedContext === contextKey.value &&
      next.projectId === requestedProjectId &&
      next.endUserId === requestedEndUserId
    ) {
      state.value = next;
      loadedContext.value = requestedContext;
    }
  } catch (cause) {
    if (current === generation)
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить внутренние поля";
  } finally {
    if (current === generation) loading.value = false;
  }
}
function openEdit(key: string) {
  if (!props.canManage || !contextReady.value) return;
  const item = state.value?.items.find(
    (candidate) => candidate.definition.key === key,
  );
  if (!item?.definition.writable) return;
  editKey.value = key;
  raw.value =
    editorKind(item) === "string-array"
      ? Array.isArray(item?.current?.value)
        ? item.current.value.join(", ")
        : ""
      : editorKind(item) === "string" &&
          typeof item?.current?.value === "string"
        ? item.current.value
        : item?.current?.value == null
          ? ""
          : JSON.stringify(item.current.value, null, 2);
  reason.value = "";
  idem.value = newIdempotencyKey();
  formError.value = "";
}
async function save(operation: "SET" | "UNSET") {
  if (!props.canManage || !contextReady.value)
    return fail("Операция больше недоступна.");
  const item = state.value?.items.find(
    (candidate) => candidate.definition.key === editKey.value,
  );
  if (
    !item ||
    !item.definition.writable ||
    !editKey.value ||
    reason.value.trim().length < 10 ||
    reason.value.trim().length > 500
  )
    return fail("Укажите причину от 10 до 500 символов.");
  let value: unknown;
  const kind = editorKind(item);
  if (operation === "SET" && kind === "string-array") {
    const tags = [
      ...new Set(
        raw.value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
    if (
      !tags.length ||
      tags.length > 50 ||
      tags.some((tag) => tag.length > 64 || hasControlCharacters(tag))
    )
      return fail(
        "Теги: 1–50 уникальных значений, каждое до 64 символов без управляющих знаков.",
      );
    value = tags;
  } else if (operation === "SET" && kind === "string") {
    value = raw.value.trim();
    if (!value || (value as string).length > 1000)
      return fail("Заметка должна содержать 1–1000 символов.");
  } else if (operation === "SET") {
    try {
      value = JSON.parse(raw.value);
    } catch {
      return fail("Введите корректный JSON согласно schema поля.");
    }
  }
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  const requestEditKey = editKey.value;
  saving.value = true;
  try {
    await endUserStateRepository.put(
      requestProjectId,
      requestEndUserId,
      requestEditKey,
      {
        operation,
        ...(operation === "SET" ? { value } : {}),
        expectedVersion: item.current?.version ?? 0,
        reason: reason.value.trim(),
      },
      idem.value,
    );
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId ||
      requestEditKey !== editKey.value ||
      !props.canManage
    )
      return;
    editKey.value = "";
    saving.value = false;
    await load();
  } catch (cause) {
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId
    )
      return;
    formError.value =
      cause instanceof Error
        ? `${cause.message}. Состояние будет перечитано перед повтором.`
        : "Не удалось сохранить";
    saving.value = false;
    await load();
    if (httpStatus(cause) === 409) idem.value = newIdempotencyKey();
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      saving.value = false;
  }
}
function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `end-user-state-${Date.now()}`;
}
function httpStatus(cause: unknown): number | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const response = (cause as { response?: unknown }).response;
  return response && typeof response === "object"
    ? (response as { status?: number }).status
    : undefined;
}
function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
}
async function showHistory(key: string) {
  if (!contextReady.value) return;
  const requestGeneration = ++historyGeneration;
  const requestedProjectId = props.projectId;
  const requestedEndUserId = props.endUserId;
  const requestedContext = contextKey.value;
  historyOpen.value = true;
  historyLoading.value = true;
  history.value = null;
  try {
    const next = await endUserStateRepository.history(
      requestedProjectId,
      requestedEndUserId,
      key,
    );
    if (
      requestGeneration === historyGeneration &&
      requestedContext === contextKey.value &&
      contextReady.value &&
      next.projectId === requestedProjectId &&
      next.endUserId === requestedEndUserId &&
      next.attributeKey === key
    )
      history.value = next;
  } catch (cause) {
    if (
      requestGeneration === historyGeneration &&
      requestedContext === contextKey.value
    ) {
      error.value =
        cause instanceof Error ? cause.message : "Не удалось загрузить историю";
      historyOpen.value = false;
    }
  } finally {
    if (requestGeneration === historyGeneration) historyLoading.value = false;
  }
}
async function loadMoreHistory() {
  if (!history.value?.page.hasMore || historyLoading.value) return;
  const current = history.value;
  const requestGeneration = ++historyGeneration;
  const requestedProjectId = props.projectId;
  const requestedEndUserId = props.endUserId;
  const requestedContext = contextKey.value;
  historyLoading.value = true;
  try {
    const next = await endUserStateRepository.history(
      requestedProjectId,
      requestedEndUserId,
      current.attributeKey,
      {
        limit: current.page.limit,
        offset: current.page.offset + current.items.length,
      },
    );
    if (
      requestedContext === contextKey.value &&
      contextReady.value &&
      requestGeneration === historyGeneration &&
      history.value === current &&
      next.projectId === requestedProjectId &&
      next.endUserId === requestedEndUserId &&
      next.attributeKey === current.attributeKey
    ) {
      history.value = {
        ...next,
        items: [...current.items, ...next.items],
        page: { ...next.page, offset: 0 },
      };
    }
  } catch (cause) {
    if (
      requestGeneration === historyGeneration &&
      requestedContext === contextKey.value
    )
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить продолжение истории";
  } finally {
    if (requestGeneration === historyGeneration) historyLoading.value = false;
  }
}
function fail(value: string) {
  formError.value = value;
}
function display(item: EndUserOperationalState["items"][number]) {
  if (item.current?.state === "SCHEDULED")
    return `Запланировано с ${new Date(item.current.effectiveAt).toLocaleString("ru-RU")}`;
  if (item.current?.state !== "ACTIVE") return "Не задано";
  return Array.isArray(item.current.value)
    ? item.current.value.join(", ")
    : String(item.current.value ?? "Не задано");
}
function editorKind(
  item: EndUserOperationalState["items"][number] | undefined,
): "string" | "string-array" | "json" {
  const schema = item?.definition.schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    return "json";
  const source = schema as Record<string, unknown>;
  if (source.type === "string") return "string";
  if (source.type === "array") {
    const items = source.items;
    if (
      items &&
      typeof items === "object" &&
      !Array.isArray(items) &&
      (items as Record<string, unknown>).type === "string"
    )
      return "string-array";
  }
  return "json";
}
function localized(value: Record<string, string>, fallback: string): string {
  const locale =
    typeof navigator === "undefined"
      ? "ru"
      : (navigator.language.toLowerCase().split("-")[0] ?? "ru");
  return (
    value[locale] ||
    value.ru ||
    value.en ||
    value.message ||
    Object.values(value).find(Boolean) ||
    fallback
  );
}
</script>
<template>
  <section class="profile-card ops">
    <header>
      <div>
        <span class="eyebrow">Internal operational state</span>
        <h3>Внутренние поля</h3>
        <p>
          Служебные CMS-данные отделены от продуктового профиля и имеют
          версионную историю.
        </p>
      </div>
    </header>
    <Skeleton v-if="loading && !state" height="90px" /><Message
      v-if="error"
      severity="error"
      :closable="false"
      >{{ error }} <Button label="Повторить" text @click="load"
    /></Message>
    <div v-if="known.length" class="attributes">
      <article v-for="item in known" :key="item.definition.key">
        <div>
          <strong>{{
            localized(item.definition.label, item.definition.key)
          }}</strong
          ><small
            >{{ item.definition.key }} · {{ item.definition.classification }} ·
            v{{ item.current?.version ?? 0 }}</small
          >
          <p>{{ display(item) }}</p>
          <small>{{ localized(item.definition.description, "") }}</small>
        </div>
        <div class="actions">
          <Button
            label="История"
            text
            size="small"
            :disabled="!contextReady"
            @click="showHistory(item.definition.key)"
          /><Button
            v-if="canManage && item.definition.writable"
            label="Изменить"
            outlined
            size="small"
            :disabled="!contextReady"
            @click="openEdit(item.definition.key)"
          />
        </div>
      </article>
    </div>
    <p v-else-if="state">CMS-managed поля не зарегистрированы backend.</p>
  </section>
  <Dialog
    :visible="Boolean(editKey)"
    modal
    :header="editKey"
    :style="{ width: 'min(650px,94vw)' }"
    @update:visible="!$event && (editKey = '')"
    ><form class="form" @submit.prevent="save('SET')">
      <Message
        v-if="editKey === 'cms.support_note'"
        severity="warn"
        :closable="false"
        >Поле SENSITIVE. Не добавляйте платёжные данные, пароли или другие
        секреты.</Message
      ><label
        >{{
          editorKind(
            state?.items.find((item) => item.definition.key === editKey),
          ) === "string-array"
            ? "Значения через запятую"
            : editorKind(
                  state?.items.find((item) => item.definition.key === editKey),
                ) === "json"
              ? "JSON-значение"
              : "Значение"
        }}<textarea
          v-model="raw"
          rows="5"
          :maxlength="
            editorKind(
              state?.items.find((item) => item.definition.key === editKey),
            ) === 'string-array'
              ? 3300
              : 10000
          "
        /></label
      ><label
        >Причина изменения<textarea
          v-model="reason"
          rows="3"
          maxlength="500"
        /></label
      ><label>Idempotency-Key<input v-model="idem" readonly /></label
      ><small v-if="formError" class="error" role="alert">{{
        formError
      }}</small>
      <footer>
        <Button
          label="Снять значение"
          severity="danger"
          outlined
          type="button"
          :loading="saving"
          @click="save('UNSET')"
        /><span /><Button
          label="Отмена"
          text
          type="button"
          @click="editKey = ''"
        /><Button label="Сохранить" type="submit" :loading="saving" />
      </footer></form></Dialog
  ><Dialog
    v-model:visible="historyOpen"
    modal
    header="История внутреннего поля"
    :style="{ width: 'min(760px,96vw)' }"
    ><Skeleton v-if="historyLoading && !history" height="120px" />
    <div v-else-if="history" class="history">
      <article v-for="event in history.items" :key="event.id">
        <strong>v{{ event.version }} · {{ event.operation }}</strong
        ><small
          >{{ new Date(event.createdAt).toLocaleString("ru-RU") }} ·
          {{ event.actor.type }}:{{ event.actor.id }}</small
        >
        <p>{{ event.reason }}</p>
        <pre v-if="event.operation === 'SET'">{{
          JSON.stringify(event.value, null, 2)
        }}</pre>
      </article>
      <p v-if="!history.items.length">История пуста.</p>
      <Button
        v-if="history.page.hasMore"
        label="Показать более ранние изменения"
        outlined
        :loading="historyLoading"
        @click="loadMoreHistory"
      /></div
  ></Dialog>
</template>
<style scoped>
.ops,
.attributes,
.form,
.history {
  display: grid;
  gap: 12px;
}
.ops {
  padding: 16px;
}
.ops h3,
.ops p,
.history p {
  margin: 3px 0;
}
.ops header p,
.ops small,
.history small {
  color: var(--text-small-muted);
}
.attributes article {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}
.attributes article > div:first-child {
  min-width: 0;
}
.attributes p {
  overflow-wrap: anywhere;
}
.actions,
footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.form label {
  display: grid;
  gap: 5px;
  font-size: 0.75rem;
  font-weight: 700;
}
.form input,
.form textarea {
  padding: 9px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-primary);
}
footer span {
  flex: 1;
}
.error {
  color: var(--status-danger-text);
}
.history article {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.history strong,
.history small {
  display: block;
}
@media (max-width: 600px) {
  .attributes article {
    flex-direction: column;
  }
  .actions {
    justify-content: flex-start;
  }
}
</style>
