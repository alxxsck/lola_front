import { nextTick } from "vue";
import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import App from "./App.vue";

function project(id: string, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    status: "ACTIVE" as const,
    supportedLocales: ["ru"],
    effectivePermissionCodes: [],
  };
}

describe("App", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.title = "";
  });

  it("shows the selected Project in the browser tab title", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    const firstProject = project("project-1", "Project One");
    const secondProject = project("project-2", "Project Two");
    auth.$patch({
      phase: "AUTHENTICATED",
      projects: [firstProject, secondProject],
      project: firstProject,
    });

    shallowMount(App, {
      global: {
        plugins: [pinia],
        stubs: {
          RouterView: true,
        },
      },
    });

    expect(document.title).toBe("L | Project One");

    auth.selectProject("project-2");
    await nextTick();

    expect(document.title).toBe("L | Project Two");
  });
});
