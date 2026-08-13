<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { ALLOWANCE_REAUTHENTICATION_MESSAGE } from '../model/allowance-reauthentication';

const props = defineProps<{ required: boolean }>();
const emit = defineEmits<{ 'fresh-login': [] }>();
const requested = ref(false);

watch(
  () => props.required,
  (required) => {
    if (!required) requested.value = false;
  },
);

function requestFreshLogin(): void {
  if (requested.value) return;
  requested.value = true;
  emit('fresh-login');
}
</script>

<template>
  <Message v-if="required" severity="warn" :closable="false">
    <span>{{ ALLOWANCE_REAUTHENTICATION_MESSAGE }}</span>
    <Button
      data-testid="allowance-fresh-login"
      label="Войти заново"
      type="button"
      outlined
      severity="warn"
      :loading="requested"
      :disabled="requested"
      @click="requestFreshLogin"
    />
  </Message>
</template>
