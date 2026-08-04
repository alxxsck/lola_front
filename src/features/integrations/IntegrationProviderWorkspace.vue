<script setup lang="ts">
import { computed } from "vue";
import IntegrationConnectionsCard from "@/features/integration-connections/IntegrationConnectionsCard.vue";
import IntegrationEventRoutesCard from "@/features/integration-event-routes/IntegrationEventRoutesCard.vue";
import IntegrationInboundActivityCard from "@/features/integration-inbound-activity/IntegrationInboundActivityCard.vue";
import IntegrationInboundConnectionsCard from "@/features/integration-inbound-connections/IntegrationInboundConnectionsCard.vue";
import IntegrationInboundRoutesCard from "@/features/integration-inbound-routes/IntegrationInboundRoutesCard.vue";
import type { OutboundIntegrationProvider } from "./provider-ui";

const props = defineProps<{
  projectId: string;
  provider: OutboundIntegrationProvider;
  canRead: boolean;
  canManage: boolean;
  canReadActivity: boolean;
}>();

const provider = computed(() =>
  props.provider === "CUSTOMER_IO"
    ? {
        title: "Customer.io",
        mark: "C",
        eyebrow: "Коммуникации с клиентами",
        heroClass: "provider-workspace__hero--customer-io",
        summary:
          "Передавайте продуктовые события в Customer.io Pipelines или принимайте подписанные события Customer.io в Lola.",
        outboundTitle: "Из Lola в Customer.io",
        outboundDescription:
          "Выберите, какие события и свойства Lola отправляет в Customer.io.",
        inboundTitle: "Из Customer.io в Lola",
        inboundDescription:
          "Lola выдаст отдельный адрес webhook и секрет проверки — это защита входящих запросов, а не второе подключение аккаунта. Затем сопоставьте события Customer.io с событиями Lola.",
      }
    : {
        title: "Amplitude",
        mark: "A",
        eyebrow: "Аналитика продукта",
        heroClass: "provider-workspace__hero--amplitude",
        summary:
          "Передавайте события Lola в Amplitude или принимайте события из Amplitude по явно настроенным правилам.",
        outboundTitle: "Из Lola в Amplitude",
        outboundDescription:
          "Выберите, какие события и свойства Lola отправляет в Amplitude.",
        inboundTitle: "Из Amplitude в Lola",
        inboundDescription:
          "Lola выдаст отдельный адрес webhook и секрет проверки — исходящий API-ключ для приёма не используется. Затем сопоставьте внешние события с Lola.",
      },
);
</script>

<template>
  <div class="provider-workspace">
    <header class="provider-workspace__hero" :class="provider.heroClass">
      <div class="provider-workspace__identity">
        <span class="provider-workspace__mark" aria-hidden="true">
          {{ provider.mark }}
        </span>
        <div>
          <span class="integration-section-intro__eyebrow">
            {{ provider.eyebrow }}
          </span>
          <h2>{{ provider.title }}</h2>
          <p>{{ provider.summary }}</p>
        </div>
      </div>
      <ol class="provider-workspace__steps" aria-label="Порядок настройки">
        <li><span>1</span>Создайте подключение</li>
        <li><span>2</span>Свяжите события</li>
        <li><span>3</span>Проверьте и включите</li>
      </ol>
    </header>

    <IntegrationInboundActivityCard
      :project-id="projectId"
      :can-read-activity="canReadActivity"
      :provider="props.provider"
    />

    <div class="provider-workspace__direction">
      <span class="provider-workspace__direction-icon pi pi-arrow-up-right" />
      <div>
        <h3>{{ provider.outboundTitle }}</h3>
        <p>{{ provider.outboundDescription }}</p>
      </div>
    </div>
    <IntegrationConnectionsCard
      :project-id="projectId"
      :can-read="canRead"
      :can-manage="canManage"
      :provider="props.provider"
    />
    <IntegrationEventRoutesCard
      :project-id="projectId"
      :can-read="canRead"
      :can-manage="canManage"
      :can-read-activity="canReadActivity"
      :provider="props.provider"
    />

    <div class="provider-workspace__direction">
      <span class="provider-workspace__direction-icon pi pi-arrow-down-left" />
      <div>
        <h3>{{ provider.inboundTitle }}</h3>
        <p>{{ provider.inboundDescription }}</p>
      </div>
    </div>
    <IntegrationInboundConnectionsCard
      :project-id="projectId"
      :can-read="canRead"
      :can-manage="canManage"
      :provider="props.provider"
    />
    <IntegrationInboundRoutesCard
      :project-id="projectId"
      :can-read="canRead"
      :can-manage="canManage"
      :provider="props.provider"
    />
  </div>
</template>
