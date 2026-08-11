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
  const source = await readFile(
    new URL("../public/support-push-sw.js", import.meta.url),
    "utf8",
  );
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

test("Case creation and later escalation remain two independent generic deliveries", async () => {
  const runtime = await harness();
  for (const [topic, capability] of [
    ["SUPPORT_CASE_CREATED", "C".repeat(43)],
    ["SUPPORT_CASE_ATTENTION", "E".repeat(43)],
  ]) {
    await dispatch(runtime.listeners.get("push"), {
      data: {
        json: () => ({
          version: 2,
          topic,
          navigation: { kind: "PERSONAL_SUPPORT_NOTIFICATION", capability },
          caseId: "must-not-be-rendered",
          message: "must-not-be-rendered",
        }),
      },
    });
  }
  assert.equal(runtime.notifications.length, 2);
  assert.deepEqual(
    runtime.notifications.map((item) => item.title),
    ["Новое обращение поддержки", "Требуется внимание поддержки"],
  );
  assert.doesNotMatch(
    JSON.stringify(runtime.notifications),
    /must-not-be-rendered/u,
  );
  assert.notEqual(
    runtime.notifications[0].options.tag,
    runtime.notifications[1].options.tag,
  );
});

for (const assignmentMode of ["MANUAL_ASSIGNMENT", "AUTO_ASSIGN"]) {
  test(`a committed ${assignmentMode} envelope reaches a closed browser and opens its deep link`, async () => {
    const runtime = await harness();
    runtime.self.clients.matchAll = async () => [];
    const capability =
      assignmentMode === "AUTO_ASSIGN" ? "A".repeat(43) : "M".repeat(43);

    await dispatch(runtime.listeners.get("push"), {
      data: {
        json: () => ({
          version: 2,
          topic: "SUPPORT_CASE_ASSIGNED_TO_ME",
          navigation: { kind: "PERSONAL_SUPPORT_NOTIFICATION", capability },
        }),
      },
    });

    assert.equal(runtime.notifications.length, 1);
    assert.equal(runtime.notifications[0].title, "Вам назначено обращение");
    const path = `/support/notifications/open#capability=${capability}`;
    assert.equal(runtime.notifications[0].options.data.path, path);

    await dispatch(runtime.listeners.get("notificationclick"), {
      notification: { close() {}, data: { path } },
    });
    assert.deepEqual(runtime.navigations, [`https://cms.example.test${path}`]);
  });
}

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
    oldSubscription: {
      options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
    },
  });
  assert.equal(runtime.messages.length, 1);
  assert.equal(
    runtime.messages[0].type,
    "RETENIVE_SUPPORT_PUSH_SUBSCRIPTION_CHANGED",
  );
});

test("failed automatic rotation still tells an open page to reconcile", async () => {
  const runtime = await harness({ rejectRotation: true });
  await dispatch(runtime.listeners.get("pushsubscriptionchange"), {
    oldSubscription: {
      options: { applicationServerKey: new Uint8Array([1]).buffer },
    },
  });
  assert.equal(runtime.messages.length, 1);
  assert.equal(
    runtime.messages[0].type,
    "RETENIVE_SUPPORT_PUSH_SUBSCRIPTION_CHANGED",
  );
});
