import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AttributeContractIssueResponseDto,
  AttributeContractWorkspaceResponseDto,
} from "@/shared/api/generated/models";
import { createContractField } from "@/features/end-user-attributes/model/contract-domain";
import ProjectUserAttributesPage from "./ProjectUserAttributesPage.vue";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  health: vi.fn(),
  revisions: vi.fn(),
  saveDraft: vi.fn(),
  validate: vi.fn(),
  publish: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: { id: "project-1" },
    user: { role: "OWNER" },
  }),
}));
vi.mock("vue-router", () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: mocks.routerPush }),
}));
vi.mock("@/shared/api/repository", () => ({ repository: { mode: "api" } }));
vi.mock(
  "@/features/end-user-attributes/api/attribute-contract-repository",
  () => ({
    attributeContractRepository: {
      workspace: mocks.workspace,
      health: mocks.health,
      revisions: mocks.revisions,
      saveDraft: mocks.saveDraft,
      validate: mocks.validate,
      publish: mocks.publish,
    },
  }),
);
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: vi.fn() }) }));

const workspace = {
  currentRevision: null,
  draft: {
    projectId: "project-1",
    draftVersion: 0,
    baseContractRevisionId: null,
    document: { fields: [] },
  },
  validation: {
    valid: true,
    draftVersion: 0,
    validationHash: "hash",
    issues: [],
    artifact: {
      fields: [],
      schema: {
        $schema: "",
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  },
};

describe("ProjectUserAttributesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue(structuredClone(workspace));
    mocks.health.mockResolvedValue(null);
    mocks.revisions.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("shows mutation controls only after Contract Workspace loaded", async () => {
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    expect(mocks.workspace).toHaveBeenCalledWith("project-1");
    expect(wrapper.find('button-stub[label="Добавить поле"]').exists()).toBe(
      true,
    );
  });

  it("explains profile fields in Russian without exposing internal platform terms", async () => {
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Поля профиля");
    expect(wrapper.text()).toContain(
      "какие данные о пользователе Lola получает от вашего продукта",
    );
    expect(
      wrapper.find('button-stub[label="Как передавать данные"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).not.toContain("Contract Workspace");
    expect(wrapper.text()).not.toContain("Integration guide");
    expect(wrapper.text()).not.toContain("AI Context");
    expect(wrapper.text()).not.toContain("Profile Health evidence");
  });

  it("opens the dedicated field page instead of a long technical dialog", async () => {
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    (wrapper.vm as unknown as { openCreate: () => void }).openCreate();

    expect(mocks.routerPush).toHaveBeenCalledWith("/profile-fields/new");
    expect(wrapper.find(".p-dialog").exists()).toBe(false);
  });

  it("does not present a failed load as a real empty contract", async () => {
    mocks.workspace.mockRejectedValue(new Error("Backend unavailable"));
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    expect(wrapper.find('message-stub[severity="error"]').exists()).toBe(true);
    expect(wrapper.find('button-stub[label="Добавить поле"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).not.toContain("Контракт пока пуст");
  });

  it("publishes readiness evidence and every security definition from validation", async () => {
    const validatedWorkspace = structuredClone(workspace);
    (
      validatedWorkspace.validation as {
        issues: AttributeContractIssueResponseDto[];
      }
    ).issues = [
      {
        code: "ATTRIBUTE_REQUIREMENT_CHANGED",
        severity: "WARNING",
        definitionId: "definition-required",
        message: "OPTIONAL to REQUIRED_WARN",
        compatibility: "CONDITIONAL",
      },
      {
        code: "ATTRIBUTE_EXPOSURE_BROADENED",
        severity: "WARNING",
        definitionId: "definition-security",
        message: "Classification changed",
        compatibility: "SECURITY",
      },
      {
        code: "ATTRIBUTE_EXPOSURE_BROADENED",
        severity: "WARNING",
        definitionId: "definition-security",
        message: "Read policy broadened",
        compatibility: "SECURITY",
      },
    ];
    mocks.workspace.mockResolvedValue(validatedWorkspace);
    mocks.publish.mockResolvedValue(undefined);
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      publishForm: {
        reason: string;
        readinessEvidenceId: string;
        confirmSecurity: boolean;
      };
      requiresReadinessEvidence: boolean;
      requiresSecurityConfirmation: boolean;
      publish: () => Promise<void>;
    };
    vm.publishForm.reason = "Roll out warning mode";
    vm.publishForm.readinessEvidenceId = "readiness-42";
    vm.publishForm.confirmSecurity = true;

    expect(vm.requiresReadinessEvidence).toBe(true);
    expect(vm.requiresSecurityConfirmation).toBe(true);
    await vm.publish();

    expect(mocks.publish).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        readinessEvidenceId: "readiness-42",
        securityConfirmations: ["definition-security"],
      }),
    );
  });

  it("never validates an older server draft while newer local edits are visible", async () => {
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      workspace: {
        draft: { document: { fields: Array<Record<string, unknown>> } };
      };
      validateDraft: () => Promise<void>;
      hasUnsavedDraftEdits: boolean;
      error: string;
    };
    vm.workspace.draft.document.fields.push({
      definitionId: "",
      key: "new_field",
      label: "New field",
      valueType: "STRING",
      lifecycle: "ACTIVE",
      classification: "INTERNAL",
      requirement: "OPTIONAL",
      position: 10,
      constraints: {},
      policies: {
        adminRead: true,
        aiRead: false,
        audienceRead: false,
        clientRead: false,
        exportRead: false,
        indexPolicy: "NONE",
        templateRead: false,
      },
    });

    expect(vm.hasUnsavedDraftEdits).toBe(true);
    await vm.validateDraft();
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(vm.error).toContain("Сначала сохраните изменения черновика");
  });

  it("turns a purpose validation error into one concrete Russian action", async () => {
    const invalidWorkspace = structuredClone(
      workspace,
    ) as AttributeContractWorkspaceResponseDto;
    invalidWorkspace.draft.document.fields = [
      {
        ...createContractField(10),
        definitionId: "definition-loyalty",
        key: "loyaltyLevel",
        label: "Уровень лояльности",
        policies: {
          ...createContractField(10).policies,
          audienceRead: true,
        },
      },
    ];
    invalidWorkspace.validation = {
      ...invalidWorkspace.validation,
      valid: false,
      issues: [
        {
          code: "ATTRIBUTE_PURPOSE_REQUIRED",
          severity: "ERROR",
          definitionId: "definition-loyalty",
          message:
            "A purpose is required for PERSONAL/SENSITIVE or exposed Attributes",
          compatibility: "SECURITY",
        },
      ],
    };
    mocks.workspace.mockResolvedValue(invalidWorkspace);

    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      errors: Array<{
        title: string;
        detail?: string;
        fieldIdentity?: string;
      }>;
      fixIssue: (issue: unknown) => void;
    };

    expect(vm.errors).toEqual([
      expect.objectContaining({
        title: "Укажите назначение поля «Уровень лояльности».",
        detail: expect.stringContaining("Для чего нужно это поле?"),
        fieldIdentity: "definition-loyalty",
      }),
    ]);
    expect(JSON.stringify(vm.errors)).not.toContain("A purpose is required");
    expect(wrapper.text()).toContain("Исправьте ошибки, чтобы опубликовать");
    expect(
      wrapper.find('button-stub[label="3. Опубликовать"]').attributes(
        "disabled",
      ),
    ).toBeDefined();
    vm.fixIssue(vm.errors[0]);
    expect(mocks.routerPush).toHaveBeenCalledWith(
      "/profile-fields/definition-loyalty",
    );
  });

  it("does not repeat the same warning from local and server validation", async () => {
    const warningWorkspace = structuredClone(
      workspace,
    ) as AttributeContractWorkspaceResponseDto;
    warningWorkspace.validation = {
      ...warningWorkspace.validation,
      issues: [
        {
          code: "ATTRIBUTE_EXPOSURE_BROADENED",
          severity: "WARNING",
          definitionId: "definition-loyalty",
          message: "Exposure broadened",
          compatibility: "SECURITY",
        },
        {
          code: "ATTRIBUTE_EXPOSURE_BROADENED",
          severity: "WARNING",
          definitionId: "definition-loyalty",
          message: "Exposure broadened again",
          compatibility: "SECURITY",
        },
      ],
    };
    mocks.workspace.mockResolvedValue(warningWorkspace);

    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      warnings: Array<{ title: string }>;
    };

    expect(vm.warnings).toEqual([
      expect.objectContaining({
        title: expect.stringContaining("Поле стало доступно в новых разделах"),
      }),
    ]);
  });

  it("does not label a new or changed draft field as active", async () => {
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    const published = {
      ...createContractField(10),
      definitionId: "definition-city",
      key: "city",
      label: "Город",
      purpose: "Показывать город в карточке пользователя",
    };
    const vm = wrapper.vm as unknown as {
      workspace: {
        currentRevision: { fields: Array<Record<string, unknown>> } | null;
      };
      fieldPublicationState: (
        field: ReturnType<typeof createContractField>,
      ) => "draft" | "changed" | "published";
    };
    vm.workspace.currentRevision = {
      fields: [
        {
          ...published,
          definitionRevisionId: "definition-city-r1",
          definitionRevisionNumber: 1,
        },
      ],
    };

    expect(vm.fieldPublicationState(published)).toBe("published");
    expect(vm.fieldPublicationState({ ...published, label: "Новый город" })).toBe(
      "changed",
    );
    expect(
      vm.fieldPublicationState({
        ...createContractField(20),
        key: "country",
        label: "Страна",
      }),
    ).toBe("draft");
  });
});
