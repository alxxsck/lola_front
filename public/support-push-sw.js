/* global self, URL */
/* Retenive Support Push v1: payloads are hints and never contain Case or Message content. */
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  const topic = payload?.topic;
  const capability = payload?.navigation?.capability;
  if (
    payload?.version !== 2 ||
    payload?.navigation?.kind !== "PERSONAL_SUPPORT_NOTIFICATION" ||
    !["SUPPORT_CASE_ATTENTION", "SUPPORT_CASE_ASSIGNED_TO_ME"].includes(topic) ||
    typeof capability !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(capability)
  )
    return;
  const assignment = topic === "SUPPORT_CASE_ASSIGNED_TO_ME";
  event.waitUntil(
    self.registration.showNotification(
      assignment ? "Вам назначено обращение" : "Требуется внимание поддержки",
      {
        body: "Откройте Retenive CMS, чтобы посмотреть детали.",
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        tag: `retenive-support-${topic}-${capability.slice(0, 8)}`,
        data: { path: `/support/notifications/open#capability=${encodeURIComponent(capability)}` },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (typeof path !== "string" || !path.startsWith("/support/notifications/open#capability=")) return;
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  const applicationServerKey = event.oldSubscription?.options.applicationServerKey;
  event.waitUntil(
    (async () => {
      try {
        if (applicationServerKey) {
          await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }
      } catch {
        // The authenticated page will reconcile or recreate the subscription.
      } finally {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clients)
          client.postMessage({ type: "RETENIVE_SUPPORT_PUSH_SUBSCRIPTION_CHANGED" });
      }
    })(),
  );
});
