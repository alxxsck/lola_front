import { describe, expect, it } from "vitest";
import type { SupportWorkspaceSelectionCaseResponseDto } from "@/shared/api/generated/models";
import {
  mapWorkspaceCase,
  withMockMessageOrdinals,
} from "./support-workspace-source";

const value: SupportWorkspaceSelectionCaseResponseDto = {
  id: "case-1",
  endUserId: "end-user-1",
  title: "Возврат",
  summary: "",
  goal: "",
  groupCode: "billing",
  projectSequence: "42",
  status: "OPEN",
  priority: "NORMAL",
  attentionRequired: false,
  lastActivityAt: "2026-08-06T10:00:00.000Z",
  updatedAt: "2026-08-06T10:00:00.000Z",
  version: 1,
  assignment: null,
};

describe("support workspace Case mapper", () => {
  it("rejects a Case projection belonging to another end user", () => {
    expect(() => mapWorkspaceCase(value, "end-user-2")).toThrow(
      "another end user",
    );
  });

  it("keeps only the safe Case context for the selected end user", () => {
    expect(mapWorkspaceCase(value, "end-user-1")).toMatchObject({
      id: "case-1",
      title: "Возврат",
      projectSequence: "42",
    });
  });

  it("keeps the server-issued assignment action ETag only in the action model", () => {
    const mapped = mapWorkspaceCase(
      {
        ...value,
        assignment: {
          actionEtag: '"sa1.current.signature"',
          capacityWeightUnits: 100,
          caseId: "case-1",
          endedAt: null,
          id: "assignment-1",
          occurrenceNumber: 1,
          operator: { id: "operator-1", displayName: "Алина", avatarUrl: null },
          startedAt: "2026-08-06T10:00:00.000Z",
          state: "ASSIGNED",
          team: { id: "team-1", code: "billing", name: "Billing" },
          version: 3,
          workforceRevisionId: "workforce-1",
        },
      },
      "end-user-1",
    );

    expect(mapped?.assignment).toMatchObject({
      id: "assignment-1",
      operatorId: "operator-1",
      actionEtag: '"sa1.current.signature"',
    });
  });

  it("rejects an assignment projection that belongs to another Case", () => {
    expect(() =>
      mapWorkspaceCase(
        {
          ...value,
          assignment: {
            actionEtag: '"sa1.current.signature"',
            capacityWeightUnits: 100,
            caseId: "case-2",
            endedAt: null,
            id: "assignment-1",
            occurrenceNumber: 1,
            operator: { id: "operator-1", displayName: "Алина", avatarUrl: null },
            startedAt: "2026-08-06T10:00:00.000Z",
            state: "ASSIGNED",
            team: { id: "team-1", code: "billing", name: "Billing" },
            version: 3,
            workforceRevisionId: "workforce-1",
          },
        },
        "end-user-1",
      ),
    ).toThrow("another case");
  });
});

describe("support workspace mock history", () => {
  it("appends a newly written mock message after the server-ordering range", () => {
    const messages = withMockMessageOrdinals([
      {
        id: "message-1",
        conversationId: "conversation-1",
        ordinal: 2,
        author: "USER",
        text: "Второе",
        status: "COMPLETED",
        createdAt: "2026-08-06T10:01:00.000Z",
      },
      {
        id: "message-2",
        conversationId: "conversation-1",
        ordinal: 1,
        author: "ADMIN",
        text: "Первое",
        status: "COMPLETED",
        createdAt: "2026-08-06T10:00:00.000Z",
      },
      {
        id: "message-3",
        conversationId: "conversation-1",
        author: "ADMIN",
        text: "Новое сообщение",
        status: "COMPLETED",
        createdAt: "2026-08-06T10:02:00.000Z",
      },
    ]);

    expect(messages.map((message) => message.ordinal)).toEqual([2, 1, 3]);
  });
});
