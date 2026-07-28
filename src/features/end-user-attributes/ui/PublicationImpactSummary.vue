<script setup lang="ts">
import { computed } from "vue";
import type { AttributePublicationChangesResponseDto } from "@/shared/api/generated/models";
import { publicationImpact } from "../model/publication-domain";

const props = defineProps<{
  changes: AttributePublicationChangesResponseDto;
  profileResyncRequired?: boolean;
}>();

const impact = computed(() => publicationImpact(props.changes));
</script>

<template>
  <section
    class="publication-impact"
    :class="`is-${impact.severity}`"
    :data-severity="impact.severity"
    aria-labelledby="publication-impact-title"
  >
    <i
      class="pi"
      :class="
        impact.severity === 'success'
          ? 'pi-check-circle'
          : impact.severity === 'error'
            ? 'pi-exclamation-triangle'
            : 'pi-info-circle'
      "
      aria-hidden="true"
    />
    <div>
      <strong id="publication-impact-title">{{ impact.title }}</strong>
      <p>{{ impact.description }}</p>
      <ul>
        <li>
          <strong>Изменится интеграция продукта:</strong>
          {{ changes.contractChanged ? "да" : "нет" }}.
        </li>
        <li>
          {{
            changes.contractChanged
              ? "Появится новая версия контракта."
              : "Версия контракта останется прежней."
          }}
        </li>
        <li>
          <strong>Потребуется повторная синхронизация:</strong>
          {{ profileResyncRequired ? "да" : "нет" }}.
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.publication-impact {
  display: flex;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  background: var(--p-content-background);
}

.publication-impact > i {
  margin-top: 0.15rem;
  font-size: 1.2rem;
}

.publication-impact p {
  margin: 0.3rem 0 0;
  color: var(--p-text-muted-color);
}

.publication-impact ul {
  margin: 0.65rem 0 0;
  padding-left: 1.1rem;
}

.publication-impact li strong {
  color: var(--p-text-color);
}

.is-success {
  border-color: color-mix(in srgb, var(--p-green-500) 38%, transparent);
}

.is-success > i {
  color: var(--p-green-500);
}

.is-warn,
.is-error {
  border-color: color-mix(in srgb, var(--p-orange-500) 42%, transparent);
}

.is-warn > i,
.is-error > i {
  color: var(--p-orange-500);
}
</style>
