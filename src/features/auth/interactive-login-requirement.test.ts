import { afterEach, describe, expect, it, vi } from "vitest";

describe("interactive login requirement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("fails closed on denied storage but trusts an explicit login in the current document", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    const requirement = await import("./interactive-login-requirement");

    expect(requirement.isInteractiveLoginRequired()).toBe(true);

    requirement.clearInteractiveLoginRequirement();

    expect(requirement.isInteractiveLoginRequired()).toBe(false);
  });

  it("returns to fail-closed behavior in a new document when storage remains denied", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    const firstDocument = await import("./interactive-login-requirement");
    firstDocument.clearInteractiveLoginRequirement();
    expect(firstDocument.isInteractiveLoginRequired()).toBe(false);

    vi.resetModules();
    const newDocument = await import("./interactive-login-requirement");

    expect(newDocument.isInteractiveLoginRequired()).toBe(true);
  });

  it("honors a durable logout marker written by another tab", async () => {
    const requirement = await import("./interactive-login-requirement");
    requirement.clearInteractiveLoginRequirement();
    expect(requirement.isInteractiveLoginRequired()).toBe(false);

    localStorage.setItem("lola-cms-interactive-login-required-v1", "1");

    expect(requirement.isInteractiveLoginRequired()).toBe(true);
  });

  it("keeps a same-tab logout marker across reload when local writes are denied", async () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === localStorage)
        throw new DOMException("Storage denied", "SecurityError");
      originalSetItem.call(this, key, value);
    });
    const firstDocument = await import("./interactive-login-requirement");

    firstDocument.requireInteractiveLogin();
    vi.resetModules();
    const reloadedDocument = await import("./interactive-login-requirement");

    expect(reloadedDocument.isInteractiveLoginRequired()).toBe(true);
  });
});
