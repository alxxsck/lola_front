<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    externalUserId: string;
    conversationTitle: string;
    messageCount: number;
    supportAvailable?: boolean;
  }>(),
  { supportAvailable: false },
);

const emit = defineEmits<{
  close: [];
  submit: [];
}>();

const subject = ref('');
const category = ref('PAYMENTS');
const priority = ref<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
const description = ref('');
const includeMessages = ref(true);
const includeProfile = ref(true);
const includeEvents = ref(false);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    subject.value = `${props.conversationTitle} · ${props.externalUserId}`;
    description.value = `Пользователь обратился в диалоге «${props.conversationTitle}». Проверьте историю переписки и профиль перед ответом.`;
  },
  { immediate: true },
);
</script>

<template>
  <Transition name="ticket-drawer">
    <aside
      v-if="visible"
      class="ticket-drawer"
      aria-label="Новый тикет"
      data-testid="ticket-drawer"
    >
      <header>
        <strong>Новый тикет</strong>
        <span>SUPPORT</span>
        <button type="button" aria-label="Закрыть форму тикета" @click="emit('close')">
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </header>

      <div class="ticket-drawer__body">
        <label>
          <span>Тема</span>
          <input v-model="subject" maxlength="180" />
        </label>

        <div class="ticket-drawer__row">
          <label>
            <span>Категория</span>
            <select v-model="category">
              <option value="PAYMENTS">Платежи</option>
              <option value="ACCOUNT">Аккаунт</option>
              <option value="GAME">Игра</option>
              <option value="OTHER">Другое</option>
            </select>
          </label>
          <fieldset>
            <legend>Приоритет</legend>
            <div class="priority-switch">
              <button
                v-for="item in [
                  { value: 'LOW', label: 'Low' },
                  { value: 'MEDIUM', label: 'Med' },
                  { value: 'HIGH', label: 'High' },
                ] as const"
                :key="item.value"
                type="button"
                :class="{ active: priority === item.value }"
                :data-priority="item.value"
                @click="priority = item.value"
              >
                {{ item.label }}
              </button>
            </div>
          </fieldset>
        </div>

        <label>
          <span>Описание</span>
          <textarea v-model="description" rows="6" maxlength="2000" />
        </label>

        <fieldset class="ticket-attachments">
          <legend>Приложить к тикету</legend>
          <label>
            <input v-model="includeMessages" type="checkbox" />
            <span>
              Последние {{ Math.min(messageCount, 20) }} сообщений (оригиналы + переводы)
            </span>
          </label>
          <label>
            <input v-model="includeProfile" type="checkbox" />
            <span>Снимок профиля</span>
          </label>
          <label>
            <input v-model="includeEvents" type="checkbox" />
            <span>События за 24 часа</span>
          </label>
        </fieldset>

        <p v-if="!supportAvailable" class="ticket-drawer__notice">
          Support API для ручного создания тикетов ещё не подключён. Форму можно проверить, но
          отправка выключена.
        </p>
      </div>

      <footer>
        <button type="button" class="secondary" @click="emit('close')">Отмена</button>
        <button
          type="button"
          class="primary"
          :disabled="!supportAvailable || !subject.trim() || !description.trim()"
          @click="emit('submit')"
        >
          Создать тикет
        </button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.ticket-drawer {
  position: absolute;
  z-index: 12;
  inset: 0 0 0 auto;
  display: flex;
  width: min(450px, 100%);
  flex-direction: column;
  border-left: 1px solid var(--border-subtle);
  background: var(--surface-subtle);
  box-shadow: var(--shadow-dialog);
  color: var(--text-primary);
}
.ticket-drawer header,
.ticket-drawer footer {
  display: flex;
  align-items: center;
  min-height: 58px;
  padding: 0 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-card);
}
.ticket-drawer header {
  gap: 10px;
}
.ticket-drawer header strong {
  flex: 1;
  font-size: 15px;
}
.ticket-drawer header span {
  color: var(--text-tertiary);
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
}
.ticket-drawer header button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.ticket-drawer header button:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.ticket-drawer__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 18px 20px;
}
.ticket-drawer label,
.ticket-drawer fieldset {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  border: 0;
}
.ticket-drawer label > span,
.ticket-drawer legend {
  color: var(--text-small-muted);
  font-size: 12px;
  font-weight: 600;
}
.ticket-drawer input:not([type='checkbox']),
.ticket-drawer select,
.ticket-drawer textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  outline: 0;
  background: var(--surface-card);
  color: var(--text-primary);
  font: 500 13px/1.5 inherit;
}
.ticket-drawer input:not([type='checkbox']),
.ticket-drawer select {
  min-height: 42px;
  padding: 0 12px;
}
.ticket-drawer textarea {
  min-height: 112px;
  padding: 10px 12px;
  resize: vertical;
}
.ticket-drawer input:focus,
.ticket-drawer select:focus,
.ticket-drawer textarea:focus {
  border-color: var(--palette-blue-400);
  box-shadow: 0 0 0 3px var(--status-accent-soft);
}
.ticket-drawer__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.priority-switch {
  display: grid;
  min-height: 42px;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
}
.priority-switch button {
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: 600 12px inherit;
  cursor: pointer;
}
.priority-switch button.active {
  background: var(--surface-hover);
  color: var(--text-primary);
  font-weight: 700;
}
.priority-switch button[data-priority='HIGH'] {
  color: var(--status-danger-text);
}
.ticket-attachments {
  gap: 10px !important;
  padding: 13px !important;
  border: 1px solid var(--border-default) !important;
  border-radius: 12px;
  background: var(--surface-card);
}
.ticket-attachments legend {
  margin-bottom: 1px;
  color: var(--text-primary);
  font-weight: 700;
}
.ticket-attachments label {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
  align-items: start;
}
.ticket-attachments input {
  width: 17px;
  height: 17px;
  margin: 1px 0 0;
  accent-color: var(--action-primary);
}
.ticket-attachments label span {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}
.ticket-drawer__notice {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--palette-amber-200);
  border-radius: 10px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 12px;
  line-height: 1.45;
}
.ticket-drawer footer {
  gap: 10px;
  justify-content: space-between;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 0;
}
.ticket-drawer footer button {
  min-height: 40px;
  padding: 0 15px;
  border-radius: 10px;
  font: 700 13px inherit;
  cursor: pointer;
}
.ticket-drawer footer .secondary {
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-small-muted);
}
.ticket-drawer footer .primary {
  border: 0;
  background: var(--action-primary);
  color: var(--on-action-primary);
}
.ticket-drawer footer .primary:disabled {
  background: var(--palette-blue-300);
  cursor: not-allowed;
}
.ticket-drawer-enter-active,
.ticket-drawer-leave-active {
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}
.ticket-drawer-enter-from,
.ticket-drawer-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
@media (max-width: 620px) {
  .ticket-drawer {
    position: fixed;
    width: 100vw;
  }
  .ticket-drawer__body {
    padding: 16px;
  }
  .ticket-drawer__row {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ticket-drawer-enter-active,
  .ticket-drawer-leave-active {
    transition: none;
  }
}
</style>
