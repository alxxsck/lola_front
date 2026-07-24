import { describe, expect, it } from "vitest";
import { PROJECT_PERMISSION_CODES } from "@/features/auth/permission-access";
import { router } from "./router";

describe("Project Logs routing", () => {
  it("allows the shared journal route through either product or integration read access", () => {
    expect(PROJECT_PERMISSION_CODES).toEqual(
      expect.arrayContaining([
        "project.integration_activity.read",
        "project.integration_message_content.read",
      ]),
    );
    const route = router
      .getRoutes()
      .find((candidate) => candidate.name === "event-logs");
    expect(route?.meta).toEqual({
      projectPermissionsAny: [
        "project.event_logs.read",
        "project.integration_activity.read",
      ],
    });
  });
});
