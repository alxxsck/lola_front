<script setup lang="ts">
import Button from "primevue/button";

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    icon: string;
    tone?: "lime" | "violet" | "coral" | "green" | "blue" | "brand";
    contentId?: string;
    headingId?: string;
    expanded?: boolean;
    eyebrow?: string;
  }>(),
  {
    tone: "violet",
    contentId: undefined,
    headingId: undefined,
    expanded: false,
    eyebrow: undefined,
  },
);

const emit = defineEmits<{ "update:expanded": [expanded: boolean] }>();

function toggle() {
  emit("update:expanded", !props.expanded);
}
</script>

<template>
  <header
    class="project-settings-header"
    :class="{ 'is-collapsed': !expanded }"
  >
    <div class="project-settings-heading">
      <span class="project-settings-icon" :class="`tone-${tone}`">
        <i :class="icon" />
      </span>
      <div>
        <span v-if="eyebrow" class="project-settings-eyebrow">{{
          eyebrow
        }}</span>
        <h2 :id="headingId">{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
    </div>
    <div
      v-if="$slots.actions"
      v-show="expanded"
      class="project-settings-actions"
    >
      <slot name="actions" />
    </div>
    <Button
      type="button"
      :icon="expanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
      severity="secondary"
      text
      rounded
      :aria-label="
        expanded ? `Свернуть раздел «${title}»` : `Развернуть раздел «${title}»`
      "
      :aria-expanded="expanded"
      :aria-controls="contentId"
      @click="toggle"
    />
  </header>
</template>

<style scoped>
.project-settings-header {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding-bottom: 21px;
  margin-bottom: 21px;
  border-bottom: 1px solid var(--border-subtle);
}
.project-settings-header.is-collapsed {
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: 0;
}
.project-settings-heading {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 13px;
}
.project-settings-heading > div {
  min-width: 0;
}
.project-settings-heading h2 {
  margin: 0;
  font-size: 1.08rem;
}
.project-settings-heading p {
  max-width: 680px;
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.5;
}
.project-settings-icon {
  width: 43px;
  height: 43px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 13px;
  box-shadow: inset 0 0 0 1px var(--border-default);
}
.tone-lime {
  background: var(--project-tone-lime-soft);
  color: var(--project-tone-lime-foreground);
}
.tone-violet {
  background: var(--project-tone-violet-soft);
  color: var(--project-tone-violet-foreground);
}
.tone-coral {
  background: var(--project-tone-coral-soft);
  color: var(--project-tone-coral-foreground);
}
.tone-green {
  background: var(--project-tone-green-soft);
  color: var(--project-tone-green-foreground);
}
.tone-blue {
  background: var(--project-tone-blue-soft);
  color: var(--project-tone-blue-foreground);
}
.tone-brand {
  background: var(--brand-soft);
  color: var(--text-brand);
}
.project-settings-eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--text-small-muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.project-settings-actions {
  flex: 0 0 auto;
}
.project-settings-header > :deep(.p-button) {
  flex: 0 0 auto;
}
@media (max-width: 700px) {
  .project-settings-header {
    flex-wrap: wrap;
  }
  .project-settings-heading {
    align-items: center;
  }
  .project-settings-actions {
    width: 100%;
    order: 3;
  }
}
</style>
