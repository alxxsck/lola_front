<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SavedSupportViewResponseDto, SupportViewPresetResponseDto } from "@/shared/api/generated/models";
import type { SupportSearchScope } from "@/features/support-search/api/support-search-source";
import type { SupportViewSelection } from "@/features/support-views/api/support-views-source";

const props = defineProps<{
  system: readonly SupportViewPresetResponseDto[];
  saved: readonly SavedSupportViewResponseDto[];
  selection: SupportViewSelection | null;
  searchScope: SupportSearchScope;
  canCreate: boolean;
  canManageAll: boolean;
  mutating: boolean;
  conflict: string;
}>();
const emit = defineEmits<{
  select: [selection: SupportViewSelection];
  create: [value: { name: string; code: string; scope: "PERSONAL" | "TEAM" | "PROJECT"; teamId: string }];
  replace: [value: { view: SavedSupportViewResponseDto; displayName: string }];
  publish: [view: SavedSupportViewResponseDto];
  archive: [view: SavedSupportViewResponseDto];
  setDefault: [selection: SupportViewSelection];
  customSearch: [];
}>();

const creating = ref(false);
const name = ref("");
const code = ref("");
const scope = ref<"PERSONAL" | "TEAM" | "PROJECT">("PERSONAL");
const teamId = ref("");
const renaming = ref(false);
const renamed = ref("");
const activeSaved = computed(() => {
  const id = props.selection?.kind === "SAVED" ? props.selection.id : null;
  return id ? props.saved.find((item) => item.id === id) ?? null : null;
});
const canSaveSurface = computed(() => props.searchScope !== "END_USERS" && !props.selection);

watch(() => activeSaved.value?.id, () => {
  renaming.value = false;
  renamed.value = "";
});
watch(() => props.selection, (selection) => {
  if (selection) creating.value = false;
});

const systemNames: Record<string, string> = {
  MY_ACTIVE: "Мои обращения",
  MY_TEAM_UNASSIGNED: "Неназначенные команды",
  ALL_CASES: "Все обращения",
  ALL_CONVERSATIONS: "Все диалоги",
};
const scopeNames = { PERSONAL: "Личное", TEAM: "Командное", PROJECT: "Проектное" } as const;

function countLabel(item: { count: { state: string; value?: number | null; cappedAt: number } }): string {
  if (item.count.state === "UNAVAILABLE" || item.count.value == null) return "";
  return item.count.state === "LOWER_BOUND" ? `≥${item.count.value}` : String(item.count.value);
}

function freshnessLabel(state: string): string {
  return state === "BUILDING" ? "Индекс обновляется" : "Индекс отстаёт";
}

function submitCreate(): void {
  emit("create", { name: name.value, code: code.value, scope: scope.value, teamId: teamId.value });
}
</script>

<template>
  <section class="views-rail" aria-label="Представления поддержки">
    <div class="views-heading">
      <strong>Представления</strong>
      <div class="views-heading-actions">
        <button v-if="selection" type="button" aria-label="Новый поиск" @click="emit('customSearch')">
          <i class="pi pi-search" aria-hidden="true" /><span>Новый поиск</span>
        </button>
        <button v-if="canCreate && canSaveSurface" type="button" aria-label="Сохранить поиск" @click="creating = !creating">
          <i class="pi pi-plus" aria-hidden="true" /><span>Сохранить</span>
        </button>
      </div>
    </div>

    <nav class="view-list" aria-label="Системные представления">
      <button
        v-for="item in system"
        :key="item.code"
        type="button"
        :class="{ active: selection?.kind === 'SYSTEM' && selection.code === item.code }"
        @click="emit('select', { kind: 'SYSTEM', code: item.code })"
      >
        <span><i class="pi pi-inbox" aria-hidden="true" />{{ systemNames[item.code] }}</span>
        <small v-if="countLabel(item)">{{ countLabel(item) }}</small>
        <i v-if="item.freshness.state !== 'READY'" class="pi pi-clock freshness" :title="item.freshness.state" />
      </button>
    </nav>

    <details v-if="saved.length" class="saved-list" open>
      <summary>Сохранённые <span>{{ saved.length }}</span></summary>
      <button
        v-for="item in saved"
        :key="item.id"
        type="button"
        :class="{ active: selection?.kind === 'SAVED' && selection.id === item.id }"
        @click="emit('select', { kind: 'SAVED', id: item.id })"
      >
        <span><i class="pi pi-bookmark" aria-hidden="true" />{{ item.draft.displayName }}</span>
        <small>
          {{ scopeNames[item.scope] }}<template v-if="countLabel(item)"> · {{ countLabel(item) }}</template>
          <i v-if="item.freshness.state !== 'READY'" class="pi pi-clock freshness" :title="freshnessLabel(item.freshness.state)" />
        </small>
      </button>
    </details>

    <form v-if="creating" class="view-form" @submit.prevent="submitCreate">
      <strong>Сохранить текущий поиск</strong>
      <label>Название<input v-model="name" required minlength="2" maxlength="120" /></label>
      <label>Код<input v-model="code" required pattern="[a-z][a-z0-9-]{1,63}" placeholder="vip-cases" /></label>
      <label>Доступ
        <select v-model="scope">
          <option value="PERSONAL">Только мне</option>
          <option v-if="canManageAll" value="TEAM">Команде</option>
          <option v-if="canManageAll" value="PROJECT">Проекту</option>
        </select>
      </label>
      <label v-if="scope === 'TEAM'">Team ID<input v-model="teamId" required /></label>
      <div><button type="button" @click="creating = false">Отмена</button><button type="submit" :disabled="mutating">Создать</button></div>
    </form>

    <div v-if="activeSaved" class="view-actions">
      <button type="button" :disabled="mutating" @click="emit('setDefault', selection!)"><i class="pi pi-home" /> По умолчанию</button>
      <button v-if="activeSaved.permissions.replaceDraft" type="button" :disabled="mutating" @click="renaming = !renaming; renamed = activeSaved.draft.displayName"><i class="pi pi-pencil" /> Переименовать</button>
      <button v-if="activeSaved.permissions.publish" type="button" :disabled="mutating" @click="emit('publish', activeSaved)"><i class="pi pi-send" /> Опубликовать</button>
      <button v-if="activeSaved.permissions.archive" type="button" class="danger" :disabled="mutating" @click="emit('archive', activeSaved)"><i class="pi pi-trash" /> В архив</button>
    </div>
    <form v-if="activeSaved && renaming" class="rename-form" @submit.prevent="emit('replace', { view: activeSaved, displayName: renamed })">
      <label>Новое название<input v-model="renamed" required minlength="2" maxlength="120" /></label>
      <button type="submit" :disabled="mutating">Сохранить</button>
    </form>
    <button v-else-if="selection && !activeSaved" type="button" class="default-action" :disabled="mutating" @click="emit('setDefault', selection)"><i class="pi pi-home" /> Сделать основным</button>
    <p v-if="conflict" class="view-conflict" role="alert">{{ conflict }}</p>
  </section>
</template>

<style scoped>
.views-rail { margin: 0 12px 10px; padding: 10px; display: grid; gap: 8px; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--surface-card) 88%, var(--brand-soft)); }
.views-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: .76rem; }
.views-heading-actions { display: flex; align-items: center; gap: 4px; }
.views-heading button, .default-action { min-height: 32px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 0; background: transparent; color: var(--text-brand); font: inherit; font-size: .7rem; font-weight: 700; line-height: 1; cursor: pointer; }
.view-list, .saved-list { display: grid; gap: 3px; }
.view-list button, .saved-list button { min-width: 0; min-height: 34px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px; border: 0; border-radius: 7px; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; }
.view-list button:hover, .saved-list button:hover, .view-list button.active, .saved-list button.active { background: var(--brand-soft); color: var(--text-primary); }
.view-list button > span, .saved-list button > span { min-width: 0; display: flex; align-items: center; gap: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .72rem; font-weight: 650; }
.views-heading button > i, .default-action > i, .view-actions button > i, .view-list button > span > i, .saved-list button > span > i { width: 16px; height: 16px; flex: 0 0 16px; display: inline-grid; place-items: center; font-size: .78rem; line-height: 1; }
.view-list small, .saved-list small { flex: 0 0 auto; color: var(--text-muted); font-size: .64rem; }
.freshness { color: var(--status-warning-text); font-size: .65rem; }
.saved-list summary { padding: 3px 7px; display: flex; justify-content: space-between; color: var(--text-muted); font-size: .66rem; font-weight: 750; cursor: pointer; list-style: none; text-transform: uppercase; letter-spacing: .05em; }
.view-form { padding-top: 8px; display: grid; gap: 7px; border-top: 1px solid var(--line); }
.view-form > strong { font-size: .74rem; }.view-form label { display: grid; gap: 3px; color: var(--text-muted); font-size: .66rem; font-weight: 700; }
.view-form input, .view-form select { min-width: 0; min-height: 34px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-card); color: var(--text-primary); font: inherit; }
.view-form > div { display: flex; justify-content: flex-end; gap: 6px; }.view-form > div button, .view-actions button { min-height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-card); color: var(--text-secondary); font: inherit; font-size: .66rem; cursor: pointer; }
.view-actions { display: flex; flex-wrap: wrap; gap: 5px; padding-top: 7px; border-top: 1px solid var(--line); }.view-actions .danger { color: var(--status-danger-text); }
.rename-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }.rename-form label { min-width: 0; display: grid; gap: 3px; color: var(--text-muted); font-size: .66rem; }.rename-form input { min-width: 0; min-height: 34px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-card); }.rename-form button { align-self: end; min-height: 34px; border: 1px solid var(--line); border-radius: 7px; background: var(--brand); color: var(--brand-contrast); }
.view-conflict { margin: 0; padding: 7px; border-radius: 7px; background: var(--status-warning-soft); color: var(--status-warning-text); font-size: .68rem; line-height: 1.35; }
@media (max-width: 767px) { .views-rail { margin-inline: 12px; }.view-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.view-list button { min-height: 44px; }.views-heading button { width: 44px; height: 44px; display: grid; place-items: center; }.views-heading button span { display: none; } }
</style>
