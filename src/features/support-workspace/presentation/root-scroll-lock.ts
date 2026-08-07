interface RootScrollSnapshot {
  app: HTMLElement | null;
  appWasInert: boolean;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  htmlOverflow: string;
  scrollX: number;
  scrollY: number;
}

let ownerCount = 0;
let snapshot: RootScrollSnapshot | null = null;

export function acquireRootScrollLock(): void {
  ownerCount += 1;
  if (ownerCount !== 1 || typeof document === "undefined") return;

  const app = document.querySelector<HTMLElement>("#app");
  snapshot = {
    app,
    appWasInert: app?.inert ?? false,
    bodyOverflow: document.body.style.overflow,
    bodyOverscrollBehavior: document.body.style.overscrollBehavior,
    bodyPaddingRight: document.body.style.paddingRight,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    bodyLeft: document.body.style.left,
    bodyRight: document.body.style.right,
    bodyWidth: document.body.style.width,
    htmlOverflow: document.documentElement.style.overflow,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  if (app) app.inert = true;
  const scrollbarWidth = Math.max(
    0,
    window.innerWidth - document.documentElement.clientWidth,
  );
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.overscrollBehavior = "none";
  document.body.style.position = "fixed";
  document.body.style.top = `${-snapshot.scrollY}px`;
  document.body.style.left = `${-snapshot.scrollX}px`;
  document.body.style.right = "0";
  document.body.style.width = "100%";
  if (scrollbarWidth > 0) {
    const currentPadding =
      Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
    document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
  }
}

export function releaseRootScrollLock(): void {
  if (ownerCount === 0) return;
  ownerCount -= 1;
  if (ownerCount !== 0 || typeof document === "undefined" || !snapshot) return;

  if (snapshot.app) snapshot.app.inert = snapshot.appWasInert;
  document.documentElement.style.overflow = snapshot.htmlOverflow;
  document.body.style.overflow = snapshot.bodyOverflow;
  document.body.style.overscrollBehavior = snapshot.bodyOverscrollBehavior;
  document.body.style.paddingRight = snapshot.bodyPaddingRight;
  document.body.style.position = snapshot.bodyPosition;
  document.body.style.top = snapshot.bodyTop;
  document.body.style.left = snapshot.bodyLeft;
  document.body.style.right = snapshot.bodyRight;
  document.body.style.width = snapshot.bodyWidth;
  window.scrollTo(snapshot.scrollX, snapshot.scrollY);
  snapshot = null;
}

export function getRootScrollLockCount(): number {
  return ownerCount;
}
