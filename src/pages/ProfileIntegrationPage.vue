<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useAuthStore } from "@/features/auth/auth.store";
import { attributeContractRepository } from "@/features/end-user-attributes/api/attribute-contract-repository";
import CodeBlock from "@/features/end-user-attributes/ui/CodeBlock.vue";
import { repository } from "@/shared/api/repository";
import type {
  AttributeContractWorkspaceResponseDto,
  ProfileHealthResponseDto,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const loading = ref(true);
const error = ref("");
const workspace = ref<AttributeContractWorkspaceResponseDto | null>(null);
const health = ref<ProfileHealthResponseDto | null>(null);
const method = ref<"direct" | "session">("direct");

const revision = computed(() => workspace.value?.currentRevision?.version ?? 1);
const published = computed(() => Boolean(workspace.value?.currentRevision));
const directExample = computed(
  () => `curl -X PUT "$LOLA_URL/api/v1/end-user-profile-snapshots" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  --data '{
    "externalUserId": "user-123",
    "contractRevision": ${revision.value},
    "observedAt": "2026-07-19T08:30:00Z",
    "sourceSequence": "42",
    "attributes": {
      "displayName": "Ада",
      "loyaltyTier": "gold"
    }
  }'`,
);
const sessionExample = computed(
  () => `const body = {
  externalUserId: "user-123",
  profileSnapshot: {
    contractRevision: ${revision.value},
    idempotencyKey: "session:user-123:42",
    observedAt: "2026-07-19T08:30:00Z",
    sourceSequence: "42",
    attributes: {
      displayName: "Ада",
      loyaltyTier: "gold"
    }
  }
};

await fetch("/api/v1/interaction-sessions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer <token>"
  },
  body: JSON.stringify(body)
});`,
);
const schemaJson = computed(() =>
  JSON.stringify(
    workspace.value?.validation.artifact.schema ??
      workspace.value?.currentRevision?.schema ?? {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    null,
    2,
  ),
);

onMounted(load);

async function load() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  loading.value = true;
  try {
    if (repository.mode === "mock") {
      workspace.value = {
        currentRevision: {
          id: "demo-revision",
          projectId,
          version: 3,
          canonicalHash: "demo",
          validationHash: "demo",
          acceptances: [],
          compatibilityReport: {
            valid: true,
            issues: [],
            lifecycleImpacts: [],
            authorization: {
              readinessEvidenceId: null,
              securityConfirmations: [],
              breakingChangePlan: null,
              compatibilityGraceDays: 7,
            },
          },
          schema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            additionalProperties: false,
            properties: {
              displayName: { type: "string" },
              loyaltyTier: {
                type: "string",
                enum: ["basic", "silver", "gold"],
              },
            },
            required: [],
          },
          fields: [],
          publishedAt: new Date().toISOString(),
          publishedById: null,
          publishReason: "Демонстрационная версия",
        },
        draft: {
          projectId,
          draftVersion: 3,
          baseContractRevisionId: "demo-revision",
          updatedById: null,
          document: { fields: [] },
        },
        validation: {
          valid: true,
          draftVersion: 3,
          validationHash: "demo",
          issues: [],
          artifact: {
            fields: [],
            schema: {
              $schema: "https://json-schema.org/draft/2020-12/schema",
              type: "object",
              additionalProperties: false,
              properties: {
                displayName: { type: "string" },
                loyaltyTier: {
                  type: "string",
                  enum: ["basic", "silver", "gold"],
                },
              },
              required: [],
            },
          },
        },
      };
      health.value = {
        since: new Date(Date.now() - 86400000).toISOString(),
        coverage: 0.84,
        requestCount: 1240,
        totalUsers: 860,
        usersWithSnapshot: 722,
        sessionRequestsWithSnapshot: 1184,
        sessionRequestsWithoutSnapshot: 56,
        idempotencyConflicts: 2,
        lastSuccessfulSnapshotAt: new Date(Date.now() - 90000).toISOString(),
        fieldCoverage: [],
        invalidReasons: {},
        oldContractIntegrations: [],
        outcomes: {},
        profileAgeDistribution: {
          upTo24Hours: 691,
          from24HoursTo7Days: 25,
          from7To30Days: 6,
          over30Days: 0,
        },
        readiness: {
          ready: true,
          coverage: 0.84,
          oldContractIntegrationCount: 0,
          pendingCleanupRequests: 0,
        },
      };
    } else {
      [workspace.value, health.value] = await Promise.all([
        attributeContractRepository.workspace(projectId),
        attributeContractRepository.health(projectId, { window: "24h" }),
      ]);
    }
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить инструкцию подключения.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page integration-page">
    <RouterLink to="/profile-fields" class="back-link">
      <i class="pi pi-arrow-left" /> К полям профиля
    </RouterLink>
    <header class="page-header integration-header">
      <div>
        <div class="eyebrow">Поля профиля пользователей</div>
        <h1>Как передавать данные</h1>
        <p class="subtitle">
          Подключите сервер вашего продукта к Lola и проверьте первый профиль
          пользователя.
        </p>
      </div>
      <Button
        class="profiles-link"
        label="Открыть профили пользователей"
        icon="pi pi-users"
        severity="secondary"
        outlined
        as="router-link"
        to="/users"
      />
    </header>

    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <div v-if="loading" class="loading-steps">
      <Skeleton
        v-for="item in 4"
        :key="item"
        height="180px"
        border-radius="18px"
      />
    </div>
    <div v-else-if="workspace" class="integration-layout">
      <nav class="step-index card" aria-label="Шаги подключения">
        <a href="#prepare"><span>1</span><strong>Подготовьте поля</strong></a>
        <a href="#method"><span>2</span><strong>Выберите способ</strong></a>
        <a href="#request"><span>3</span><strong>Отправьте профиль</strong></a>
        <a href="#verify"><span>4</span><strong>Проверьте результат</strong></a>
      </nav>

      <main class="steps">
        <section id="prepare" class="step-card card">
          <span class="step-number">1</span>
          <div class="step-content">
            <h2>Подготовьте поля профиля</h2>
            <p>
              Передавайте только опубликованные поля. Черновик не влияет на
              работающую интеграцию.
            </p>
            <div class="readiness" :class="{ ready: published }">
              <i
                :class="
                  published ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'
                "
              />
              <span
                ><strong>{{
                  published
                    ? `Опубликована версия ${revision}`
                    : "Поля ещё не опубликованы"
                }}</strong
                ><small>{{
                  published
                    ? "Можно переходить к подключению."
                    : "Вернитесь к полям, проверьте черновик и опубликуйте его."
                }}</small></span
              >
              <RouterLink v-if="!published" to="/profile-fields"
                >Открыть поля</RouterLink
              >
            </div>
          </div>
        </section>

        <section id="method" class="step-card card">
          <span class="step-number">2</span>
          <div class="step-content">
            <h2>Выберите способ передачи</h2>
            <p>
              Оба способа отправляют полный профиль. Новый запрос заменяет
              предыдущие данные пользователя.
            </p>
            <div class="method-grid">
              <button
                type="button"
                :class="{ selected: method === 'direct' }"
                @click="method = 'direct'"
              >
                <span class="method-icon"><i class="pi pi-sync" /></span>
                <span
                  ><strong>Обновлять профиль при изменении</strong
                  ><small
                    >Рекомендуем для синхронизации из CRM или сервера вашего
                    продукта.</small
                  ></span
                >
                <i
                  :class="
                    method === 'direct' ? 'pi pi-check-circle' : 'pi pi-circle'
                  "
                />
              </button>
              <button
                type="button"
                :class="{ selected: method === 'session' }"
                @click="method = 'session'"
              >
                <span class="method-icon"><i class="pi pi-bolt" /></span>
                <span
                  ><strong>Передавать профиль при запуске сессии</strong
                  ><small
                    >Выберите, если данные формируются прямо перед общением с
                    пользователем.</small
                  ></span
                >
                <i
                  :class="
                    method === 'session' ? 'pi pi-check-circle' : 'pi pi-circle'
                  "
                />
              </button>
            </div>
          </div>
        </section>

        <section id="request" class="step-card card">
          <span class="step-number">3</span>
          <div class="step-content">
            <h2>Отправьте тестовый профиль</h2>
            <p v-if="method === 'direct'">
              Скопируйте команду, подставьте адрес Lola и серверный токен, затем
              выполните её на сервере вашего продукта.
            </p>
            <p v-else>
              Добавьте объект <code>profileSnapshot</code> при создании сессии
              на сервере вашего продукта.
            </p>
            <CodeBlock
              v-if="method === 'direct'"
              title="Пример обновления профиля"
              language="curl"
              :code="directExample"
            />
            <CodeBlock
              v-else
              title="Пример создания сессии"
              language="JavaScript"
              :code="sessionExample"
            />
            <div class="replace-list">
              <div>
                <code>$LOLA_URL</code><span>Адрес API вашего проекта Lola</span>
              </div>
              <div>
                <code>$TOKEN</code
                ><span>Серверный токен с доступом к записи профилей</span>
              </div>
              <div>
                <code>user-123</code
                ><span>ID пользователя в вашем продукте</span>
              </div>
            </div>
            <details class="technical-details">
              <summary>Технические параметры</summary>
              <dl>
                <div>
                  <dt>Доступ токена</dt>
                  <dd><code>profile:snapshot:write</code></dd>
                </div>
                <div>
                  <dt>Порядок обновлений</dt>
                  <dd>
                    <code>sourceSequence</code> должен расти для каждого
                    пользователя
                  </dd>
                </div>
                <div>
                  <dt>Повтор запроса</dt>
                  <dd>Запрос с тем же ключом можно безопасно повторить</dd>
                </div>
                <div>
                  <dt>Полная отправка</dt>
                  <dd>
                    Передавайте все актуальные поля пользователя в каждом
                    запросе
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        </section>

        <section id="verify" class="step-card card">
          <span class="step-number">4</span>
          <div class="step-content">
            <h2>Проверьте результат</h2>
            <p>
              После успешного запроса откройте пользователя и убедитесь, что
              новые значения появились в профиле.
            </p>
            <div class="verification-card">
              <span class="verification-icon"><i class="pi pi-check" /></span>
              <span
                ><strong>{{
                  health?.lastSuccessfulSnapshotAt
                    ? "Lola уже получает профили"
                    : "Первый профиль пока не получен"
                }}</strong
                ><small v-if="health?.lastSuccessfulSnapshotAt"
                  >Последнее успешное обновление:
                  {{
                    new Date(health.lastSuccessfulSnapshotAt).toLocaleString(
                      "ru-RU",
                    )
                  }}</small
                ><small v-else
                  >Отправьте тестовый запрос, затем обновите эту
                  страницу.</small
                ></span
              >
              <Button
                label="Открыть профиль пользователя"
                icon="pi pi-arrow-right"
                icon-pos="right"
                as="router-link"
                to="/users"
              />
            </div>
            <details class="technical-details schema-details">
              <summary>Посмотреть техническую схему JSON</summary>
              <CodeBlock
                title="Схема опубликованных полей"
                language="JSON Schema"
                :code="schemaJson"
              />
            </details>
          </div>
        </section>
      </main>
    </div>
  </section>
</template>

<style scoped>
.integration-page {
  max-width: 1180px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
  color: var(--status-violet-text);
  font-size: 0.76rem;
  font-weight: 800;
}
.integration-header {
  margin-bottom: 22px;
}
:deep(.profiles-link.p-button) {
  border-color: var(--border-strong);
  background: var(--surface-card);
  color: var(--text-primary);
}
.loading-steps {
  display: grid;
  gap: 14px;
}
.integration-layout {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.step-index {
  position: sticky;
  top: 24px;
  display: grid;
  padding: 10px;
}
.step-index a {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 11px;
  border-radius: 11px;
  color: var(--muted);
  font-size: 0.7rem;
}
.step-index a:hover {
  background: var(--surface-subtle);
  color: var(--text-primary);
}
.step-index span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--surface-subtle);
  font: 700 0.68rem Manrope;
}
.steps {
  display: grid;
  gap: 14px;
}
.step-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 16px;
  padding: 24px;
  scroll-margin-top: 24px;
}
.step-number {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: var(--surface-emphasis);
  color: var(--accent);
  font: 700 0.82rem Manrope;
}
.step-content {
  min-width: 0;
}
.step-content h2 {
  font-size: 1.05rem;
}
.step-content > p {
  max-width: 72ch;
  margin: 6px 0 18px;
  color: var(--muted);
  font-size: 0.78rem;
}
.readiness {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--status-warning);
  border-radius: 14px;
  background: var(--status-warning-soft);
}
.readiness.ready {
  border-color: color-mix(
    in srgb,
    var(--status-success) 35%,
    var(--border-default)
  );
  background: var(--status-success-soft);
}
.readiness > i {
  font-size: 1.25rem;
  color: var(--status-warning-text);
}
.readiness.ready > i {
  color: var(--status-success-text);
}
.readiness span {
  min-width: 0;
  flex: 1;
}
.readiness strong,
.readiness small {
  display: block;
}
.readiness strong {
  font-size: 0.76rem;
}
.readiness small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.66rem;
}
.readiness a {
  color: var(--status-violet-text);
  font-size: 0.7rem;
  font-weight: 800;
}
.method-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.method-grid button {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 15px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-subtle);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.method-grid button.selected {
  border-color: var(--status-violet-text);
  background: var(--status-violet-soft);
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--status-violet) 12%, transparent);
}
.method-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--surface-card);
  color: var(--status-violet-text);
}
.method-grid strong,
.method-grid small {
  display: block;
}
.method-grid strong {
  font-size: 0.73rem;
}
.method-grid small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.63rem;
  line-height: 1.35;
}
.replace-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.replace-list > div {
  padding: 11px;
  border: 1px solid var(--border-default);
  border-radius: 11px;
  background: var(--surface-subtle);
}
.replace-list code,
.replace-list span {
  display: block;
}
.replace-list code {
  color: var(--status-violet-text);
  font-size: 0.65rem;
}
.replace-list span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.62rem;
}
.technical-details {
  margin-top: 14px;
  border: 1px solid var(--border-default);
  border-radius: 13px;
  background: var(--surface-subtle);
  overflow: hidden;
}
.technical-details summary {
  padding: 13px 15px;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 800;
}
.technical-details dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 1px;
  background: var(--border-default);
}
.technical-details dl > div {
  padding: 12px;
  background: var(--surface-card);
}
.technical-details dt {
  color: var(--muted);
  font-size: 0.62rem;
}
.technical-details dd {
  margin: 4px 0 0;
  font-size: 0.68rem;
}
.verification-card {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 15px;
  border-radius: 15px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.verification-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--status-success);
  color: var(--on-status-success);
}
.verification-card strong,
.verification-card small {
  display: block;
}
.verification-card strong {
  font-size: 0.78rem;
}
.verification-card small {
  margin-top: 4px;
  color: var(--text-on-emphasis-muted);
  font-size: 0.65rem;
}
.schema-details {
  background: var(--surface-card);
}
.schema-details :deep(.code-block) {
  margin: 0 14px 14px;
}
@media (max-width: 900px) {
  .integration-layout {
    grid-template-columns: 1fr;
  }
  .step-index {
    position: static;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow: auto;
  }
  .step-index a {
    display: flex;
    white-space: nowrap;
  }
  .step-index strong {
    display: none;
  }
  .method-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .integration-page {
    padding-left: 14px;
    padding-right: 14px;
  }
  .step-card {
    grid-template-columns: 1fr;
    padding: 18px;
  }
  .step-number {
    width: 36px;
    height: 36px;
  }
  .replace-list,
  .technical-details dl {
    grid-template-columns: 1fr;
  }
  .verification-card {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .verification-card > .p-button {
    grid-column: 1/-1;
    width: 100%;
  }
  .step-index {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .step-index a {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    white-space: normal;
  }
  .step-index strong {
    display: block;
  }
}
</style>
