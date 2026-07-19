export type CmsRealtimeState =
  "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "DEGRADED";

export interface CmsRealtimeCallbacks {
  subscriptions: Record<
    string,
    (value: unknown) => string | null | Promise<string | null>
  >;
  acknowledgement: {
    socketEvent: string;
    rest(projectId: string, eventId: string): Promise<void>;
  };
  onConnect(): void | Promise<void>;
  onStateChange(state: CmsRealtimeState): void;
}
