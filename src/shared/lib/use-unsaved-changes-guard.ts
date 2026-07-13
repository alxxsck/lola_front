import { onBeforeUnmount, onMounted, type ComputedRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useUnsavedChangesGuard(isDirty: ComputedRef<boolean>, message: string) {
  const confirmDiscard = () => !isDirty.value || window.confirm(message)

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty.value) return
    event.preventDefault()
  }

  onBeforeRouteLeave(confirmDiscard)
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

  return { confirmDiscard }
}
