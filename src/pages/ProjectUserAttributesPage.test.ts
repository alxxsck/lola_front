import { flushPromises, shallowMount } from "@vue/test-utils";
import { nextTick } from "vue";
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
  toast: vi.fn(),
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
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: mocks.toast }) }));

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
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
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

  it("explains every publication field next to its label", async () => {
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    const { publishHelp } = wrapper.vm as unknown as {
      publishHelp: Record<string, string>;
    };

    expect(Object.keys(publishHelp)).toHaveLength(4);
    expect(publishHelp.graceDays).toContain("Переходный период");
    expect(publishHelp.graceDays).toContain("предыдущую версию полей");
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
    const validatedWorkspace = structuredClone(
      workspace,
    ) as AttributeContractWorkspaceResponseDto;
    validatedWorkspace.draft.document.fields = [
      {
        ...createContractField(10),
        definitionId: "definition-required",
        key: "requiredField",
        label: "Обязательное поле",
        purpose: "Использовать поле в профиле пользователя",
      },
    ];
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

  it("shows a backend validation message, code, and concrete field action", async () => {
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
            "Укажите назначение персонального или доступного разделам поля.",
          compatibility: "SECURITY",
        },
      ],
    };
    mocks.workspace.mockResolvedValue(invalidWorkspace);

    const wrapper = shallowMount(ProjectUserAttributesPage, {
      global: {
        stubs: {
          Message: { template: "<div><slot /></div>" },
        },
      },
    });
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
        detail:
          "Укажите назначение персонального или доступного разделам поля.",
        fieldIdentity: "definition-loyalty",
      }),
    ]);
    expect(wrapper.text()).toContain(
      "Укажите назначение персонального или доступного разделам поля.",
    );
    expect(wrapper.text()).toContain("Код: ATTRIBUTE_PURPOSE_REQUIRED");
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
        draft: {
          document: { fields: ReturnType<typeof createContractField>[] };
        };
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
    expect(
      vm.fieldPublicationState({ ...published, label: "Новый город" }),
    ).toBe("changed");
    expect(
      vm.fieldPublicationState({
        ...createContractField(20),
        key: "country",
        label: "Страна",
      }),
    ).toBe("draft");

    vm.workspace.draft.document.fields = [
      { ...published, label: "Новый город" },
    ];
    await nextTick();
    const changedTag = wrapper.find('tag-stub[value="Изменено в черновике"]');
    expect(changedTag.exists()).toBe(true);
    expect(changedTag.attributes("title")).toContain(
      "Сохранённые настройки поля отличаются от опубликованных",
    );
  });

  it.each([
    {
      scenario: "reordered object keys",
      draftPurpose: "Показывать уровень лояльности в карточке пользователя",
      publishedPolicies: {
        templateRead: false,
        indexPolicy: "NONE" as const,
        exportRead: false,
        clientRead: false,
        audienceRead: false,
        aiRead: false,
        adminRead: true,
      },
    },
    {
      scenario: "backend-normalized field whitespace",
      draftPurpose: "Показывать уровень лояльности в карточке пользователя ",
      publishedPolicies: undefined,
    },
  ])("treats $scenario as published", async ({ draftPurpose, publishedPolicies }) => {
    const publishedWorkspace = structuredClone(
      workspace,
    ) as AttributeContractWorkspaceResponseDto;
    const draftField = {
      definitionId: "definition-loyalty",
      key: "loyaltyLevel",
      label: "Уровень лояльности",
      description: null,
      purpose: draftPurpose,
      valueType: "STRING" as const,
      lifecycle: "ACTIVE" as const,
      classification: "INTERNAL" as const,
      requirement: "OPTIONAL" as const,
      position: 10,
      constraints: {},
      policies: {
        adminRead: true,
        aiRead: false,
        audienceRead: false,
        clientRead: false,
        exportRead: false,
        indexPolicy: "NONE" as const,
        templateRead: false,
      },
      replacementDefinitionId: null,
      sunsetAt: null,
      semanticRole: null,
    };
    publishedWorkspace.draft.document.fields = [draftField];
    publishedWorkspace.draft.draftVersion = 14;
    publishedWorkspace.validation.draftVersion = 14;
    publishedWorkspace.currentRevision = {
      id: "revision-2",
      projectId: "project-1",
      version: 2,
      canonicalHash: "canonical-hash",
      validationHash: "validation-hash",
      acceptances: [],
      compatibilityReport: {
        valid: true,
        issues: [],
        lifecycleImpacts: [],
        authorization: {
          readinessEvidenceId: null,
          securityConfirmations: [],
          breakingChangePlan: null,
          compatibilityGraceDays: 7,
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
      fields: [
        {
          ...draftField,
          definitionRevisionId: "definition-loyalty-r2",
          definitionRevisionNumber: 2,
          purpose: "Показывать уровень лояльности в карточке пользователя",
          policies: publishedPolicies ?? draftField.policies,
        },
      ],
      publishedAt: "2026-07-20T10:00:00.000Z",
      publishedById: null,
      publishReason: "Публикация версии 2",
    };
    mocks.workspace.mockResolvedValue(publishedWorkspace);

    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      dirty: boolean;
      canPublish: boolean;
      publishForm: { reason: string };
      fields: typeof publishedWorkspace.draft.document.fields;
      fieldPublicationState: (
        field: (typeof publishedWorkspace.draft.document.fields)[number],
      ) => "draft" | "changed" | "published";
    };

    expect(vm.dirty).toBe(false);
    expect(vm.fieldPublicationState(vm.fields[0])).toBe("published");
    vm.publishForm.reason = "Повторная публикация";
    await nextTick();
    expect(vm.canPublish).toBe(false);
    expect(wrapper.text()).toContain("Все изменения опубликованы");
    expect(wrapper.text()).toContain("Совпадает с опубликованной версией 2");
    expect(wrapper.text()).not.toContain("Версия 14");
    expect(wrapper.text()).not.toContain("Есть изменения");
    expect(wrapper.text()).not.toContain(
      "Черновик проверен — можно публиковать",
    );
  });

  it("allows removing a saved field that only exists in the draft", async () => {
    const draftOnlyWorkspace = structuredClone(
      workspace,
    ) as AttributeContractWorkspaceResponseDto;
    draftOnlyWorkspace.draft.document.fields = [
      {
        ...createContractField(10),
        definitionId: "definition-draft-only",
        key: "draftCity",
        label: "Черновой город",
      },
    ];
    mocks.workspace.mockResolvedValue(draftOnlyWorkspace);
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();

    const removeButton = wrapper.find(
      'button-stub[aria-label="Удалить Черновой город"]',
    );
    expect(removeButton.exists()).toBe(true);
    await removeButton.trigger("click");
    expect(wrapper.text()).not.toContain("Черновой город");
  });

  it("does not allow removing a field from the current revision", async () => {
    const publishedWorkspace = structuredClone(
      workspace,
    ) as AttributeContractWorkspaceResponseDto;
    const publishedField = {
      ...createContractField(10),
      definitionId: "definition-published",
      key: "publishedCity",
      label: "Опубликованный город",
    };
    publishedWorkspace.draft.document.fields = [publishedField];
    publishedWorkspace.currentRevision = {
      fields: [
        {
          ...publishedField,
          definitionRevisionId: "definition-published-r1",
          definitionRevisionNumber: 1,
        },
      ],
    } as unknown as NonNullable<
      AttributeContractWorkspaceResponseDto["currentRevision"]
    >;
    mocks.workspace.mockResolvedValue(publishedWorkspace);
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();

    expect(
      wrapper
        .find('button-stub[aria-label="Удалить Опубликованный город"]')
        .exists(),
    ).toBe(false);
  });

  it("copies every visible profile field without opening the integration guide", async () => {
    const publishedWorkspace = structuredClone(
      workspace,
    ) as AttributeContractWorkspaceResponseDto;
    publishedWorkspace.currentRevision = {
      version: 5,
      fields: [
        {
          key: "displayName",
          label: "Отображаемое имя",
          description: "Имя для интерфейса",
          valueType: "STRING",
          requirement: "OPTIONAL",
          lifecycle: "ACTIVE",
        },
        {
          key: "depositCount",
          label: "Количество депозитов",
          valueType: "INTEGER",
          requirement: "REQUIRED_ENFORCED",
          lifecycle: "ACTIVE",
        },
      ],
    } as NonNullable<AttributeContractWorkspaceResponseDto["currentRevision"]>;
    publishedWorkspace.draft.document.fields = [
      {
        ...createContractField(10),
        key: "displayName",
        label: "Отображаемое имя",
      },
      {
        ...createContractField(20),
        key: "depositCount",
        label: "Количество депозитов",
        valueType: "INTEGER",
        requirement: "REQUIRED_ENFORCED",
      },
      {
        ...createContractField(30),
        key: "futureField",
        label: "Будущее поле",
      },
    ];
    mocks.workspace.mockResolvedValue(publishedWorkspace);
    const wrapper = shallowMount(ProjectUserAttributesPage);
    await flushPromises();

    await wrapper.get('button-stub[aria-label="Скопировать поля профиля"]').trigger("click");

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Состояние: текущий черновик (ещё не опубликован)"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("| `displayName` | `string` | необязательно |"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("| `depositCount` | `integer` | обязательно (строго) |"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("| `futureField` | `string` | необязательно |"),
    );
    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Поля профиля скопированы" }),
    );
  });
});
