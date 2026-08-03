<script setup lang="ts">
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import { repository } from "@/shared/api/repository";
import { isMockMode } from "@/shared/config/data-mode";
import PagedSearchSelect, {
  type PagedSearchPage,
} from "@/shared/ui/PagedSearchSelect.vue";

const props = defineProps<{
  projectId: string;
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

async function load(input: {
  query: string;
  cursor?: string;
  limit: number;
}): Promise<PagedSearchPage> {
  if (isMockMode) return loadMock(input);
  const response = await endUserProfileRepository.list(props.projectId, {
    limit: input.limit,
    ...(input.query ? { externalUserId: input.query } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });
  return {
    items: response.items.map((user) => ({
      value: user.endUserId,
      label: user.externalUserId,
      description: user.locale ?? undefined,
    })),
    nextCursor: response.nextCursor ?? null,
  };
}

async function loadMock(input: {
  query: string;
  cursor?: string;
  limit: number;
}): Promise<PagedSearchPage> {
  const response = await repository.getUsersPage(props.projectId, {
    limit: 100,
  });
  const query = input.query.toLocaleLowerCase("ru-RU");
  const filtered = response.items.filter(
    (user) =>
      !query || user.externalId.toLocaleLowerCase("ru-RU").includes(query),
  );
  const offset = cursorOffset(input.cursor);
  const page = filtered.slice(offset, offset + input.limit);
  const nextOffset = offset + page.length;
  return {
    items: page.map((user) => ({
      value: user.id,
      label: user.externalId,
      description: user.locale ?? undefined,
    })),
    nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
  };
}

function cursorOffset(cursor: string | undefined): number {
  const offset = Number(cursor);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}
</script>

<template>
  <PagedSearchSelect
    :model-value="modelValue"
    :reload-key="projectId"
    :load="load"
    :disabled="disabled"
    label="ID пользователя в вашем продукте"
    placeholder="Найдите и выберите пользователя"
    search-placeholder="Введите ID пользователя"
    empty-text="Пользователи не найдены"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
