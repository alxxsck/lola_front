import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function harness({ rejectRotation = false } = {}) {
  const listeners = new Map();
  const notifications = [];
  const navigations = [];
  const messages = [];
  const client = {
    url: "https://cms.example.test/overview",
    async navigate(url) {
      navigations.push(url);
    },
    async focus() {},
    postMessage(message) {
      messages.push(message);
    },
  };
  const self = {
    location: { origin: "https://cms.example.test" },
    registration: {
      async showNotification(title, options) {
        notifications.push({ title, options });
      },
      pushManager: {
        subscribe: async () => {
          if (rejectRotation) throw new Error("provider unavailable");
          return {};
        },
      },
    },
    clients: {
      async matchAll() {
        return [client];
      },
      async openWindow(url) {
        navigations.push(url);
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const source = await readFile(new URL("../public/support-push-sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, { self, URL });
  return { listeners, notifications, navigations, messages, self };
}

async function dispatch(listener, event) {
  const pending = [];
  listener({ ...event, waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
}

test("Support Push renders only generic copy and keeps the capability in a fragment", async () => {
  const runtime = await harness();
  const capability = "A".repeat(43);
  await dispatch(runtime.listeners.get("push"), {
    data: {
      json: () => ({
        version: 2,
        topic: "SUPPORT_CASE_ATTENTION",
        navigation: { kind: "PERSONAL_SUPPORT_NOTIFICATION", capability },
        caseTitle: "SECRET CASE TITLE",
        messageBody: "SECRET MESSAGE BODY",
      }),
    },
  });

  assert.equal(runtime.notifications.length, 1);
  const serialized = JSON.stringify(runtime.notifications[0]);
  assert.doesNotMatch(serialized, /SECRET/u);
  assert.equal(
    runtime.notifications[0].options.data.path,
    `/support/notifications/open#capability=${capability}`,
  );
});

test("notification click navigates with a fragment and subscription rotation notifies clients", async () => {
  const runtime = await harness();
  const capability = "B".repeat(43);
  await dispatch(runtime.listeners.get("notificationclick"), {
    notification: {
      close() {},
      data: { path: `/support/notifications/open#capability=${capability}` },
    },
  });
  assert.deepEqual(runtime.navigations, [
    `https://cms.example.test/support/notifications/open#capability=${capability}`,
  ]);

  await dispatch(runtime.listeners.get("pushsubscriptionchange"), {
    oldSubscription: { options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer } },
  });
  assert.equal(runtime.messages.length, 1);
  assert.equal(runtime.messages[0].type, "RETENIVE_SUPPORT_PUSH_SUBSCRIPTION_CHANGED");
});

test("failed automatic rotation still tells an open page to reconcile", async () => {
  const runtime = await harness({ rejectRotation: true });
  await dispatch(runtime.listeners.get("pushsubscriptionchange"), {
    oldSubscription: { options: { applicationServerKey: new Uint8Array([1]).buffer } },
  });
  assert.equal(runtime.messages.length, 1);
  assert.equal(runtime.messages[0].type, "RETENIVE_SUPPORT_PUSH_SUBSCRIPTION_CHANGED");
});
