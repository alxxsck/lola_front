<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useAuthStore } from '@/features/auth/auth.store';
import { hasProjectPermission } from '@/features/auth/permission-access';
import { endUserCasesRepository } from '@/features/end-user-cases/api/end-user-cases-repository';
import type {
  EndUserCaseCostSummaryResponseDto,
  EndUserCasePolicyPreviewResponseDto,
  EndUserCasePolicyResponseDto,
} from '@/shared/api/generated/models';

const auth = useAuthStore();
const policy = ref<EndUserCasePolicyResponseDto | null>(null);
const cost = ref<EndUserCaseCostSummaryResponseDto | null>(null);
const editor = ref('');
const preview = ref<EndUserCasePolicyPreviewResponseDto | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const message = ref('');

const projectId = computed(() => auth.project?.id ?? null);
const canReadCost = computed(() =>
  hasProjectPermission(auth.project?.effectivePermissionCodes ?? [], 'project.ai_usage.read'),
);
const integerFormatter = new Intl.NumberFormat('ru-RU');
const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
const signalWord = (count: number): string => {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'сигналов';
  const last = count % 10;
  if (last === 1) return 'сигнал';
  return last >= 2 && last <= 4 ? 'сигнала' : 'сигналов';
};
const previewGroups = computed(() => {
  const groups = preview.value?.compiledPolicy.groups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const group = value as { code?: unknown; label?: unknown };
    if (typeof group.code !== 'string') return [];
    return [
      {
        code: group.code,
        label:
          group.code === 'UNMAPPED'
            ? 'Другие темы'
            : typeof group.label === 'string'
              ? group.label
              : group.code,
      },
    ];
  });
});
const previewPriorityRuleCount = computed(() => {
  const rules = preview.value?.compiledPolicy.priorityFloors;
  return Array.isArray(rules) ? rules.length : 0;
});
const previewVersion = computed(() => preview.value?.compilerVersion.match(/v(\d+)$/u)?.[1] ?? '—');
const draftOverview = computed(() => {
  try {
    const value = JSON.parse(editor.value) as {
      groups?: Array<Record<string, unknown>>;
      priorityRules?: unknown[];
    };
    const groups = Array.isArray(value.groups)
      ? value.groups.flatMap((group) => {
          const code = typeof group.code === 'string' ? group.code : '';
          const label =
            typeof group.label === 'string'
              ? group.label
              : typeof group.title === 'string'
                ? group.title
                : code;
          return code && label ? [{ code, label }] : [];
        })
      : [];
    return {
      groups,
      priorityRuleCount: Array.isArray(value.priorityRules) ? value.priorityRules.length : 0,
    };
  } catch {
    return { groups: [], priorityRuleCount: 0 };
  }
});

onMounted(load);

async function load(): Promise<void> {
  if (!projectId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [policyValue, costValue] = await Promise.all([
      endUserCasesRepository.policy(projectId.value),
      canReadCost.value ? endUserCasesRepository.cost(projectId.value) : Promise.resolve(null),
    ]);
    policy.value = policyValue;
    cost.value = costValue;
    const source = policyValue.draft ?? policyValue.published;
    editor.value = JSON.stringify(toDraft(source.compiledPolicy), null, 2);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить настройки';
  } finally {
    loading.value = false;
  }
}

function parsedDraft(): {
  groups: Record<string, unknown>[];
  priorityRules: Record<string, unknown>[];
  scheduling?: Record<string, unknown>;
} | null {
  try {
    const value = JSON.parse(editor.value) as Record<string, unknown>;
    if (!Array.isArray(value.groups) || !Array.isArray(value.priorityRules))
      throw new Error('В настройках должны быть списки категорий и правил приоритета');
    return {
      groups: value.groups as Record<string, unknown>[],
      priorityRules: value.priorityRules as Record<string, unknown>[],
      ...(value.scheduling &&
      typeof value.scheduling === 'object' &&
      !Array.isArray(value.scheduling)
        ? { scheduling: value.scheduling as Record<string, unknown> }
        : {}),
    };
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось прочитать формат настроек';
    return null;
  }
}

async function previewDraft(): Promise<void> {
  const draft = parsedDraft();
  if (!draft || !projectId.value) return;
  loading.value = true;
  error.value = '';
  message.value = '';
  try {
    preview.value = await endUserCasesRepository.previewPolicy(projectId.value, draft);
    message.value = 'Правила корректны. Проверка не изменила опубликованные настройки.';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Политика не прошла проверку';
  } finally {
    loading.value = false;
  }
}

async function saveDraft(): Promise<void> {
  const draft = parsedDraft();
  if (!draft || !projectId.value || !policy.value) return;
  saving.value = true;
  error.value = '';
  try {
    const current = policy.value.draft ?? policy.value.published;
    await endUserCasesRepository.savePolicy(projectId.value, {
      ...draft,
      expectedVersion: current.version,
      idempotencyKey: crypto.randomUUID(),
    });
    message.value = 'Черновик сохранён.';
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось сохранить черновик';
  } finally {
    saving.value = false;
  }
}

async function publish(): Promise<void> {
  if (!projectId.value || !policy.value?.draft) return;
  saving.value = true;
  error.value = '';
  try {
    await endUserCasesRepository.publishPolicy(projectId.value, {
      expectedVersion: policy.value.draft.version,
      idempotencyKey: crypto.randomUUID(),
      reason: 'Publish Case taxonomy and priority policy from CMS',
    });
    message.value = 'Правила опубликованы и применяются к новым анализам.';
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось опубликовать политику';
  } finally {
    saving.value = false;
  }
}

function toDraft(compiled: Record<string, unknown>) {
  const groups = Array.isArray(compiled.groups)
    ? compiled.groups.filter(
        (group) =>
          group && typeof group === 'object' && (group as { code?: unknown }).code !== 'UNMAPPED',
      )
    : [];
  return {
    groups,
    priorityRules: Array.isArray(compiled.priorityFloors) ? compiled.priorityFloors : [],
    scheduling:
      compiled.scheduling && typeof compiled.scheduling === 'object' ? compiled.scheduling : {},
  };
}
</script>

<template>
  <section class="page case-settings-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Обращения пользователей</div>
        <h1>Категории и приоритеты</h1>
        <p class="subtitle">
          Опубликованный список помогает Retenive группировать и приоритизировать обращения, но не
          ограничивает обнаружение новых тем.
        </p>
      </div>
      <Button
        label="Назад к обращениям"
        icon="pi pi-arrow-left"
        severity="secondary"
        outlined
        @click="$router.push({ name: 'end-user-cases' })"
      />
    </header>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <Message v-if="message" severity="success" :closable="false">{{ message }}</Message>

    <div v-if="cost" class="cost-grid">
      <div>
        <span>Запросы Retenive</span
        ><strong>{{ integerFormatter.format(Number(cost.requestCount)) }}</strong>
      </div>
      <div>
        <span>Использовано токенов</span
        ><strong>{{ integerFormatter.format(Number(cost.totalTokens)) }}</strong>
      </div>
      <div>
        <span>Стоимость анализа</span
        ><strong>{{ moneyFormatter.format(Number(cost.billedCostUsd)) }}</strong>
      </div>
      <div>
        <span>Дневной лимит токенов</span>
        <strong>{{ integerFormatter.format(Number(cost.budget.projectDailyTokenHardCap)) }}</strong>
      </div>
    </div>
    <Message v-if="cost?.budget.emergencyPaused" severity="warn" :closable="false">
      Анализ обращений приостановлен платформой. Сигналы сохраняются и будут обработаны после снятия
      паузы.
    </Message>
    <Message v-else-if="cost && cost.budget.backlogCount > 0" severity="warn" :closable="false">
      В очереди анализа {{ integerFormatter.format(cost.budget.backlogCount) }}
      {{ signalWord(cost.budget.backlogCount) }}.
      <template v-if="cost.budget.oldestPendingAt">
        Самый ранний ожидает с
        {{ new Date(cost.budget.oldestPendingAt).toLocaleString('ru-RU') }}.
      </template>
      Новые сообщения сохраняются и будут обработаны автоматически после восстановления доступности
      или лимита.
    </Message>

    <div class="settings-grid">
      <section class="card card-pad">
        <div class="section-heading">
          <div>
            <h2>Черновик правил</h2>
            <p>
              Категории, минимальные приоритеты и интервалы проверки. Резервная категория
              добавляется автоматически.
            </p>
          </div>
          <span v-if="policy"> Версия {{ (policy.draft ?? policy.published).version }} </span>
        </div>
        <div class="draft-summary">
          <strong>Категории: {{ draftOverview.groups.length }}</strong>
          <ul v-if="draftOverview.groups.length">
            <li v-for="group in draftOverview.groups" :key="group.code">
              {{ group.label }}
            </li>
          </ul>
          <span v-else
            >Пользовательские категории пока не заданы. Retenive всё равно будет находить новые
            темы.</span
          >
          <span>Правил минимального приоритета: {{ draftOverview.priorityRuleCount }}</span>
        </div>
        <details class="advanced-editor" open>
          <summary>Редактирование правил</summary>
          <p>
            Редактируйте категории, минимальные приоритеты и интервалы проверки в техническом
            формате ниже. Перед публикацией Retenive проверит правила и покажет понятный итог
            справа.
          </p>
          <Textarea
            v-model="editor"
            class="policy-editor"
            rows="28"
            :disabled="loading || saving"
            spellcheck="false"
            aria-label="Настройки категорий и приоритетов"
          />
        </details>
        <div class="actions">
          <Button
            label="Проверить"
            severity="secondary"
            outlined
            :loading="loading"
            @click="previewDraft"
          />
          <Button label="Сохранить черновик" :loading="saving" @click="saveDraft" />
          <Button
            label="Опубликовать"
            severity="success"
            :disabled="!policy?.draft"
            :loading="saving"
            @click="publish"
          />
        </div>
      </section>

      <aside class="card card-pad preview-card">
        <h2>Что будет применять Retenive</h2>
        <template v-if="preview">
          <p>Версия правил {{ previewVersion }}</p>
          <div class="preview-summary">
            <strong>Категории: {{ previewGroups.length }}</strong>
            <ul>
              <li v-for="group in previewGroups" :key="group.code">
                {{ group.label }}
              </li>
            </ul>
            <span>Правил минимального приоритета: {{ previewPriorityRuleCount }}</span>
          </div>
          <details class="technical-preview">
            <summary>Показать технические данные</summary>
            <p>
              {{ preview.compilerVersion }} ·
              {{ preview.compiledPolicyHash.slice(0, 12) }}
            </p>
            <pre>{{ JSON.stringify(preview.compiledPolicy, null, 2) }}</pre>
          </details>
        </template>
        <p v-else class="empty-copy">
          Нажмите «Проверить», чтобы увидеть итоговые правила до сохранения.
        </p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.case-settings-page {
  max-width: 1420px;
}
.cost-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.cost-grid > div {
  padding: 15px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-card);
}
.cost-grid span,
.cost-grid strong {
  display: block;
}
.cost-grid span {
  color: var(--text-tertiary);
  font-size: 0.7rem;
}
.cost-grid strong {
  margin-top: 6px;
}
.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
  gap: 16px;
  margin-top: 16px;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.section-heading h2,
.preview-card h2 {
  margin: 0;
  font-size: 1rem;
}
.section-heading p,
.preview-card p {
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
}
.policy-editor {
  width: 100%;
  margin-top: 14px;
  font:
    0.76rem/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.draft-summary {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.8rem;
}
.draft-summary strong {
  color: var(--text-primary);
}
.draft-summary ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}
.advanced-editor {
  margin-top: 16px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.advanced-editor summary {
  cursor: pointer;
  color: var(--text-primary);
  font-weight: 700;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.preview-card pre {
  max-height: 650px;
  padding: 14px;
  overflow: auto;
  border-radius: 12px;
  background: var(--surface-subtle);
  font-size: 0.7rem;
  white-space: pre-wrap;
}
.preview-summary {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.8rem;
}
.preview-summary strong {
  color: var(--text-primary);
}
.preview-summary ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}
.technical-preview {
  margin-top: 16px;
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.technical-preview summary {
  cursor: pointer;
  font-weight: 700;
}
.empty-copy {
  padding: 50px 10px;
  text-align: center;
}
@media (max-width: 940px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .cost-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .actions :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }
}
</style>
