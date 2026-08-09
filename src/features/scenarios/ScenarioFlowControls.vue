<script setup lang="ts">
import { computed } from "vue";
import { Panel, PanelPosition, useVueFlow } from "@vue-flow/core";

defineProps<{
  layouting?: boolean;
  layoutFailed?: boolean;
}>();

const emit = defineEmits<{
  autoLayout: [];
}>();

const { fitView, maxZoom, minZoom, viewport, zoomIn, zoomOut } = useVueFlow();

const zoomInDisabled = computed(() => viewport.value.zoom >= maxZoom.value);
const zoomOutDisabled = computed(() => viewport.value.zoom <= minZoom.value);

function handleZoomIn() {
  void zoomIn();
}

function handleZoomOut() {
  void zoomOut();
}

function handleFitView() {
  void fitView();
}

function handleAutoLayout() {
  emit("autoLayout");
}
</script>

<template>
  <Panel class="vue-flow__controls" :position="PanelPosition.BottomLeft">
    <button
      type="button"
      class="vue-flow__controls-button vue-flow__controls-zoomin"
      aria-label="Увеличить схему"
      :disabled="zoomInDisabled"
      @click="handleZoomIn"
    ><i class="pi pi-plus" /></button>
    <button
      type="button"
      class="vue-flow__controls-button vue-flow__controls-zoomout"
      aria-label="Уменьшить схему"
      :disabled="zoomOutDisabled"
      @click="handleZoomOut"
    ><i class="pi pi-minus" /></button>
    <button
      type="button"
      class="vue-flow__controls-button vue-flow__controls-fitview"
      aria-label="Показать всю схему"
      @click="handleFitView"
    ><i class="pi pi-expand" /></button>
    <button
      type="button"
      class="vue-flow__controls-button scenario-auto-layout"
      :class="{ 'layout-failed': layoutFailed }"
      :aria-label="layouting ? 'Выполняется автораскладка' : 'Перестроить схему автоматически'"
      :title="layoutFailed ? 'Последняя автораскладка не выполнена — показана резервная схема' : undefined"
      :disabled="layouting"
      @click="handleAutoLayout"
    ><i :class="layouting ? 'pi pi-spin pi-spinner' : 'pi pi-sparkles'" /></button>
  </Panel>
</template>

<style scoped>
.scenario-auto-layout{margin-top:6px;border-top:1px solid var(--border-default)}
.scenario-auto-layout.layout-failed{color:var(--status-warning-text)}
</style>
