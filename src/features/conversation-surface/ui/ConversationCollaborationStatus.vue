<script setup lang="ts">
import { computed } from "vue";
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
      class="collaboration-presence"
      role="status"
      aria-live="polite"
      :title="`${viewerLabel}. Это просмотр, а не назначение обращения.`"
    >
      <span class="collaboration-presence__avatars" aria-hidden="true">
        <i
          v-for="viewer in collaboration.viewers.slice(0, 3)"
          :key="viewer.cmsUserId"
        >{{ viewer.displayName.trim().charAt(0).toUpperCase() }}</i>
      </span>
      <span>{{ viewerLabel }}</span>
      <small>просмотр</small>
    </div>
    <div
      v-else-if="variant === 'COLLISION' && (showCollision || typerLabel || degraded)"
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
        <small>Перед отправкой обновите переписку и проверьте последние ответы.</small>
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.collaboration-presence {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  min-height: 28px;
  padding: 3px 8px 3px 4px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}
.collaboration-presence__avatars {
  display: flex;
  padding-left: 2px;
}
.collaboration-presence__avatars i {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-left: -3px;
  border: 2px solid var(--surface-subtle);
  border-radius: 50%;
  color: var(--text-primary);
  background: var(--brand-soft);
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
}
.collaboration-presence small {
  padding-left: 6px;
  border-left: 1px solid var(--border-default);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.collaboration-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 12px 8px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--status-warning) 28%, var(--border-default));
  border-radius: 10px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--status-warning-soft) 72%, var(--surface-card));
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
  border-color: color-mix(in srgb, var(--status-warning) 42%, var(--border-default));
}
.collaboration-status-enter-active,
.collaboration-status-leave-active {
  transition: opacity 180ms ease, transform 180ms ease, max-height 180ms ease;
}
.collaboration-status-enter-from,
.collaboration-status-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (max-width: 767px) {
  .collaboration-presence {
    max-width: 190px;
  }
  .collaboration-presence > span:not(.collaboration-presence__avatars) {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .collaboration-warning {
    margin-inline: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .collaboration-status-enter-active,
  .collaboration-status-leave-active {
    transition: none;
  }
}
</style>
