import type { RouteLocationRaw } from "vue-router";

export function cmsUserDetailRoute(
  cmsUserId: string,
  canReadCmsUsers: boolean,
): RouteLocationRaw | undefined {
  if (!canReadCmsUsers) return undefined;
  return {
    name: "platform-cms-users",
    params: { cmsUserId },
  };
}
