<script setup lang="ts">
import { computed, ref } from "vue";
import Popover from "primevue/popover";
import type { ConversationSurfaceCollaboration } from "../model/conversation-surface-contract";

const props = defineProps<{
  variant: "PRESENCE" | "COLLISION";
  collaboration: ConversationSurfaceCollaboration;
}>();

function names(items: Array<{ displayName: string }>): string {
  const visible = items.slice(0, 2).map((item) => item.displayName);
  if (visible.length === 1) return visible[0]!;
  if (visible.length === 2) return `${visible[0]} и ${visible[1]}`;
  return "";
}

const viewerLabel = computed(() => {
  const count = props.collaboration.viewers.length;
  if (!count) return "";
  const suffix = count > 2 ? ` и ещё ${count - 2}` : "";
  return `${count === 1 ? "Смотрит" : "Смотрят"}: ${names(props.collaboration.viewers)}${suffix}`;
});
const viewerCountLabel = computed(() => {
  const count = props.collaboration.viewers.length;
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun =
    mod100 >= 11 && mod100 <= 14
      ? "наблюдателей"
      : mod10 === 1
        ? "наблюдатель"
        : mod10 >= 2 && mod10 <= 4
          ? "наблюдателя"
          : "наблюдателей";
  return `${count} ${noun}`;
});
const presencePopover = ref<InstanceType<typeof Popover> | null>(null);

function togglePresence(event: Event): void {
  presencePopover.value?.toggle(event);
}
const typerLabel = computed(() => {
  const count = props.collaboration.typers.length;
  if (!count) return "";
  const suffix = count > 2 ? ` и ещё ${count - 2}` : "";
  return `${names(props.collaboration.typers)}${suffix} ${count === 1 ? "печатает" : "печатают"} ответ`;
});
const showCollision = computed(
  () => props.collaboration.collision.state === "OTHER_OPERATOR_REPLIED",
);
const degraded = computed(
  () => props.collaboration.availability === "DEGRADED",
);
</script>

<template>
  <Transition name="collaboration-status">
    <div
      v-if="variant === 'PRESENCE' && viewerLabel"
      class="collaboration-presence-shell"
    >
      <button
        type="button"
        class="collaboration-presence"
        aria-haspopup="dialog"
        :aria-label="`${viewerCountLabel}. Показать, кто сейчас смотрит диалог`"
        :title="`${viewerLabel}. Просмотр не означает назначение обращения.`"
        @click="togglePresence"
      >
        <i class="pi pi-eye" aria-hidden="true" />
        <span>{{ collaboration.viewers.length }}</span>
      </button>
      <Popover
        ref="presencePopover"
        class="collaboration-presence-popover"
        :base-z-index="1200"
      >
        <section
          class="collaboration-presence-card"
          aria-label="Кто сейчас смотрит диалог"
        >
          <header>
            <span>Сейчас смотрят</span>
            <strong>{{ collaboration.viewers.length }}</strong>
          </header>
          <ul>
            <li v-for="viewer in collaboration.viewers" :key="viewer.cmsUserId">
              <i aria-hidden="true">{{
                viewer.displayName.trim().charAt(0).toUpperCase()
              }}</i>
              <span>{{ viewer.displayName }}</span>
            </li>
          </ul>
          <p>Просмотр не означает назначение обращения.</p>
        </section>
      </Popover>
    </div>
    <div
      v-else-if="
        variant === 'COLLISION' && (showCollision || typerLabel || degraded)
      "
      class="collaboration-warning"
      :class="{ 'is-collision': showCollision }"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <i
        :class="showCollision ? 'pi pi-exclamation-circle' : 'pi pi-pencil'"
        aria-hidden="true"
      />
      <span v-if="showCollision">
        <strong>Коллега уже отправил ответ</strong>
        <small>Проверьте обновлённую переписку перед отправкой своего.</small>
      </span>
      <span v-else-if="typerLabel">
        <strong>{{ typerLabel }}</strong>
        <small>Можно продолжать — отправка не заблокирована.</small>
      </span>
      <span v-else>
        <strong>Не удалось проверить параллельную работу</strong>
        <small
          >Перед отправкой обновите переписку и проверьте последние
          ответы.</small
        >
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.collaboration-presence-shell {
  display: inline-flex;
  flex: 0 0 auto;
}
.collaboration-presence {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 44px;
  min-height: 32px;
  padding: 4px 9px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  font-size: 12px;
  font: inherit;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 140ms ease,
    border-color 140ms ease,
    background-color 140ms ease,
    transform 120ms ease;
}
.collaboration-presence:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--surface-hover);
}
.collaboration-presence:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.collaboration-presence:active {
  transform: scale(0.97);
}
.collaboration-presence > i {
  font-size: 13px;
}
.collaboration-presence-card {
  display: grid;
  width: min(280px, calc(100vw - 32px));
  gap: 10px;
}
.collaboration-presence-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 750;
}
.collaboration-presence-card header strong {
  color: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.collaboration-presence-card ul {
  display: grid;
  max-height: 224px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  overscroll-behavior: contain;
}
.collaboration-presence-card li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 6px 0;
  border-top: 1px solid var(--border-subtle);
}
.collaboration-presence-card li > i {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-primary);
  background: var(--brand-soft);
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}
.collaboration-presence-card li > span {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collaboration-presence-card p {
  margin: 0;
  padding-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.4;
}
.collaboration-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 12px 8px;
  padding: 8px 12px;
  border: 1px solid
    color-mix(in srgb, var(--status-warning) 28%, var(--border-default));
  border-radius: 10px;
  color: var(--text-primary);
  background: color-mix(
    in srgb,
    var(--status-warning-soft) 72%,
    var(--surface-card)
  );
}
.collaboration-warning > i {
  flex: 0 0 auto;
  color: var(--status-warning-text);
  font-size: 14px;
}
.collaboration-warning > span {
  display: grid;
  min-width: 0;
  gap: 1px;
}
.collaboration-warning strong {
  font-size: 12px;
  line-height: 1.35;
}
.collaboration-warning small {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.35;
}
.collaboration-warning.is-collision {
  border-color: color-mix(
    in srgb,
    var(--status-warning) 42%,
    var(--border-default)
  );
}
.collaboration-status-enter-active,
.collaboration-status-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    max-height 180ms ease;
}
.collaboration-status-enter-from,
.collaboration-status-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (max-width: 767px) {
  .collaboration-warning {
    margin-inline: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .collaboration-status-enter-active,
  .collaboration-status-leave-active {
    transition: none;
  }
  .collaboration-presence {
    transition: none;
  }
}
</style>
