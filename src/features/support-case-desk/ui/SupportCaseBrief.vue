<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";

const props = defineProps<{
  caseTitle: string;
  projectSequence: string;
  summary: string;
  goal: string;
  blockers?: string[];
  limitations?: string[];
}>();

const expanded = ref(false);
const cleanSummary = computed(
  () => props.summary.trim() || "Сводка пока не сформирована.",
);
const cleanGoal = computed(
  () => props.goal.trim() || "Цель обращения пока не сформулирована.",
);
const hasBlockerData = computed(() => props.blockers !== undefined);
const blockers = computed(() =>
  (props.blockers ?? []).map((item) => item.trim()).filter(Boolean),
);
const limitations = computed(() =>
  (props.limitations ?? []).map((item) => item.trim()).filter(Boolean),
);
</script>

<template>
  <section class="case-brief" aria-labelledby="case-brief-title">
    <header class="case-brief__header">
      <div>
        <span class="case-brief__kicker">Контекст обращения</span>
        <h4 id="case-brief-title">Суть обращения</h4>
      </div>
      <Button
        class="case-brief__expand"
        type="button"
        label="Подробнее"
        aria-label="Открыть полный контекст обращения"
        icon="pi pi-expand"
        icon-pos="right"
        severity="secondary"
        size="small"
        text
        @click="expanded = true"
      />
    </header>

    <div class="case-brief__summary">
      <span>Сводка</span>
      <p>{{ cleanSummary }}</p>
    </div>

    <div class="case-brief__rail">
      <article class="case-brief__goal">
        <i class="pi pi-bullseye" aria-hidden="true" />
        <div>
          <span>Цель</span>
          <p>{{ cleanGoal }}</p>
        </div>
      </article>
      <article
        v-if="hasBlockerData"
        class="case-brief__blockers"
        :class="{ 'is-clear': !blockers.length }"
      >
        <i
          :class="blockers.length ? 'pi pi-ban' : 'pi pi-check-circle'"
          aria-hidden="true"
        />
        <div>
          <span>Блокеры · {{ blockers.length }}</span>
          <p>
            {{
              blockers[0] ??
              "Активных препятствий для продолжения работы не зафиксировано."
            }}
          </p>
        </div>
      </article>
    </div>
  </section>

  <Dialog
    v-model:visible="expanded"
    modal
    :header="`Контекст обращения #${projectSequence}`"
    class="case-brief-dialog"
    :style="{ width: 'min(880px, calc(100vw - 24px))' }"
    :draggable="false"
  >
    <div class="case-brief-sheet">
      <header class="case-brief-sheet__intro">
        <span class="case-brief-sheet__intro-icon" aria-hidden="true">
          <i class="pi pi-comments" />
        </span>
        <div>
          <span class="case-brief__kicker">Бриф перед ответом</span>
          <h3>{{ caseTitle }}</h3>
          <p>Сначала контекст, затем ожидаемый результат и риски.</p>
        </div>
      </header>

      <article
        class="case-brief-sheet__summary"
        aria-labelledby="brief-summary-title"
      >
        <span class="case-brief-sheet__section-icon" aria-hidden="true">
          <i class="pi pi-align-left" />
        </span>
        <div class="case-brief-sheet__section-content">
          <header>
            <div>
              <span class="case-brief-sheet__eyebrow">Что произошло</span>
              <h4 id="brief-summary-title">Сводка</h4>
            </div>
            <span class="case-brief-sheet__tag">Контекст</span>
          </header>
          <p>{{ cleanSummary }}</p>
        </div>
      </article>

      <article
        class="case-brief-sheet__goal"
        aria-labelledby="brief-goal-title"
      >
        <span class="case-brief-sheet__section-icon" aria-hidden="true">
          <i class="pi pi-bullseye" />
        </span>
        <div class="case-brief-sheet__section-content">
          <header>
            <div>
              <span class="case-brief-sheet__eyebrow">Что нужно получить</span>
              <h4 id="brief-goal-title">Цель пользователя</h4>
            </div>
            <span class="case-brief-sheet__tag">Ориентир ответа</span>
          </header>
          <p>{{ cleanGoal }}</p>
        </div>
      </article>

      <div
        v-if="hasBlockerData || limitations.length"
        class="case-brief-sheet__signals"
        aria-label="Риски и ограничения"
      >
        <section
          v-if="hasBlockerData"
          class="case-brief-sheet__signal case-brief-sheet__blockers"
          :class="{ 'is-clear': !blockers.length }"
          aria-labelledby="brief-blockers-title"
        >
          <header>
            <span class="case-brief-sheet__signal-icon" aria-hidden="true">
              <i :class="blockers.length ? 'pi pi-ban' : 'pi pi-check'" />
            </span>
            <div>
              <span class="case-brief-sheet__eyebrow">Проверьте до ответа</span>
              <h4 id="brief-blockers-title">Блокеры</h4>
            </div>
            <small>{{ blockers.length }}</small>
          </header>
          <ul v-if="blockers.length">
            <li v-for="blocker in blockers" :key="blocker">
              <i class="pi pi-minus-circle" aria-hidden="true" />
              <span>{{ blocker }}</span>
            </li>
          </ul>
          <div v-else class="case-brief-sheet__clear-state">
            <i class="pi pi-check-circle" aria-hidden="true" />
            <span>Активных блокеров нет</span>
          </div>
        </section>

        <section
          v-if="limitations.length"
          class="case-brief-sheet__signal case-brief-sheet__limitations"
          aria-labelledby="brief-limitations-title"
        >
          <header>
            <span class="case-brief-sheet__signal-icon" aria-hidden="true">
              <i class="pi pi-shield" />
            </span>
            <div>
              <span class="case-brief-sheet__eyebrow">Не обещать лишнего</span>
              <h4 id="brief-limitations-title">Ограничения</h4>
            </div>
            <small>{{ limitations.length }}</small>
          </header>
          <ul>
            <li v-for="limitation in limitations" :key="limitation">
              <i class="pi pi-info-circle" aria-hidden="true" />
              <span>{{ limitation }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
    <template #footer>
      <Button
        type="button"
        label="Закрыть"
        severity="secondary"
        outlined
        @click="expanded = false"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.case-brief {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.case-brief__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.case-brief__header h4 {
  margin: 3px 0 0;
  font-size: 0.88rem;
  font-weight: 750;
  letter-spacing: -0.01em;
  line-height: 1.3;
  text-wrap: balance;
}
.case-brief__kicker,
.case-brief__summary > span,
.case-brief__rail article span {
  color: var(--text-muted);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.case-brief__expand {
  flex: 0 0 auto;
  min-height: 40px;
}
.case-brief__summary {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-soft) 56%, var(--surface-card));
}
.case-brief__summary p,
.case-brief__rail p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 0.76rem;
  line-height: 1.45;
  text-wrap: pretty;
}
.case-brief__summary p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.case-brief__rail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--line);
}
.case-brief__rail article {
  min-width: 0;
  padding: 8px 10px 0;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
}
.case-brief__rail article + article {
  border-left: 1px solid var(--line);
}
.case-brief__rail i {
  margin-top: 2px;
  color: var(--brand-primary);
  font-size: 0.78rem;
}
.case-brief__rail .case-brief__blockers i,
.case-brief__rail .case-brief__blockers span {
  color: var(--status-warning-text);
}
.case-brief__rail .case-brief__blockers.is-clear i,
.case-brief__rail .case-brief__blockers.is-clear span {
  color: var(--status-success-text);
}
.case-brief__rail p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.case-brief-sheet {
  display: grid;
  gap: 16px;
}
.case-brief-sheet__intro {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--line);
}
.case-brief-sheet__intro-icon,
.case-brief-sheet__section-icon,
.case-brief-sheet__signal-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 12px;
}
.case-brief-sheet__intro-icon {
  width: 44px;
  height: 44px;
  background: var(--brand-soft);
  color: var(--brand-primary);
  font-size: 1.05rem;
}
.case-brief-sheet h3 {
  margin: 4px 0 0;
  font-size: 1.12rem;
  letter-spacing: -0.015em;
  line-height: 1.3;
  text-wrap: balance;
}
.case-brief-sheet__intro p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}
.case-brief-sheet__summary,
.case-brief-sheet__goal {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.case-brief-sheet__summary {
  background: color-mix(in srgb, var(--brand-soft) 50%, var(--surface-card));
  border-color: color-mix(in srgb, var(--brand-primary) 20%, var(--line));
}
.case-brief-sheet__goal {
  background: var(--surface-card);
  box-shadow: inset 3px 0 0 var(--brand-primary);
}
.case-brief-sheet__section-icon {
  width: 40px;
  height: 40px;
  background: var(--surface-card);
  color: var(--brand-primary);
  font-size: 0.92rem;
}
.case-brief-sheet__goal .case-brief-sheet__section-icon {
  background: var(--brand-soft);
}
.case-brief-sheet__section-content {
  min-width: 0;
}
.case-brief-sheet__section-content > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.case-brief-sheet__eyebrow {
  display: block;
  color: var(--text-muted);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.075em;
  line-height: 1.3;
  text-transform: uppercase;
}
.case-brief-sheet h4 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.35;
}
.case-brief-sheet__tag,
.case-brief-sheet__signal small {
  flex: 0 0 auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--surface-card);
  color: var(--text-muted);
  font-size: 0.62rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  text-align: center;
}
.case-brief-sheet__section-content > p {
  max-width: 72ch;
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 0.86rem;
  line-height: 1.58;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.case-brief-sheet__signals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.case-brief-sheet__signal {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-muted);
}
.case-brief-sheet__signal > header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.case-brief-sheet__signal-icon {
  width: 36px;
  height: 36px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.82rem;
}
.case-brief-sheet__blockers {
  border-color: color-mix(in srgb, var(--status-warning-text) 30%, var(--line));
  background: color-mix(
    in srgb,
    var(--status-warning-soft) 55%,
    var(--surface-card)
  );
}
.case-brief-sheet__blockers .case-brief-sheet__signal-icon,
.case-brief-sheet__blockers h4 {
  color: var(--status-warning-text);
}
.case-brief-sheet__blockers.is-clear {
  border-color: color-mix(in srgb, var(--status-success-text) 24%, var(--line));
  background: color-mix(
    in srgb,
    var(--status-success-soft) 45%,
    var(--surface-card)
  );
}
.case-brief-sheet__blockers.is-clear .case-brief-sheet__signal-icon,
.case-brief-sheet__blockers.is-clear h4 {
  color: var(--status-success-text);
}
.case-brief-sheet__limitations .case-brief-sheet__signal-icon {
  color: var(--brand-primary);
}
.case-brief-sheet__signal ul {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.case-brief-sheet__signal li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  color: var(--text-primary);
  font-size: 0.78rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.case-brief-sheet__signal li i {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.7rem;
}
.case-brief-sheet__blockers li i {
  color: var(--status-warning-text);
}
.case-brief-sheet__clear-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  color: var(--status-success-text);
  font-size: 0.78rem;
  font-weight: 700;
}
:deep(.case-brief-dialog .p-dialog-header) {
  padding-bottom: 12px;
}
:deep(.case-brief-dialog .p-dialog-content) {
  padding-top: 4px;
}

@media (max-width: 640px) {
  .case-brief-sheet {
    gap: 12px;
  }
  .case-brief-sheet__intro {
    grid-template-columns: 36px minmax(0, 1fr);
    padding-bottom: 12px;
  }
  .case-brief-sheet__intro-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
  .case-brief-sheet h3 {
    font-size: 1rem;
  }
  .case-brief-sheet__intro p {
    display: none;
  }
  .case-brief-sheet__summary,
  .case-brief-sheet__goal {
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
  }
  .case-brief-sheet__section-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    font-size: 0.78rem;
  }
  .case-brief-sheet__section-content > header {
    align-items: flex-start;
  }
  .case-brief-sheet__tag {
    display: none;
  }
  .case-brief-sheet__signals {
    grid-template-columns: 1fr;
  }
  :deep(.case-brief-dialog .p-dialog-header) {
    padding: 16px 16px 10px;
  }
  :deep(.case-brief-dialog .p-dialog-content) {
    padding: 4px 16px 12px;
  }
  :deep(.case-brief-dialog .p-dialog-footer) {
    padding: 10px 16px 16px;
  }
}
</style>
