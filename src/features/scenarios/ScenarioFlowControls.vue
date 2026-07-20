<script setup lang="ts">
import { computed } from "vue";
import { Panel, PanelPosition, useVueFlow } from "@vue-flow/core";

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
  </Panel>
</template>
