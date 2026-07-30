import { storeSelectedProjectId } from "@/shared/api/http/auth-session";

export function openProjectInNewTab(
  projectId: string,
  path = "/overview",
): boolean {
  if (typeof window === "undefined") return false;
  const tab = window.open("", "_blank");
  if (!tab) return false;
  storeSelectedProjectId(projectId, tab.sessionStorage);
  tab.opener = null;
  tab.location.replace(new URL(path, window.location.origin).toString());
  return true;
}
