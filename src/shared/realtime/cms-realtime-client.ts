import { io, type Socket } from "socket.io-client";
import { isMockMode } from "@/shared/config/data-mode";
import {
  getAccessToken,
  getRefreshToken,
} from "@/shared/api/http/auth-session";
import { refreshAccessToken } from "@/shared/api/http/axios-instance";
import type {
  CmsRealtimeCallbacks,
  CmsRealtimeState,
} from "./cms-realtime-contract";

function apiOrigin(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(
    /\/api\/v1\/?$/,
    "",
  );
}

async function freshAccessToken(): Promise<string> {
  let token = getAccessToken();
  if (token) return token;
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("CMS session is unavailable");
  await refreshAccessToken(refreshToken);
  token = getAccessToken();
  if (!token) throw new Error("CMS access token refresh failed");
  return token;
}

export class CmsRealtimeClient {
  private socket: Socket | null = null;
  private projectId: string | null = null;
  private callbacks: CmsRealtimeCallbacks | null = null;

  async connect(
    projectId: string,
    callbacks: CmsRealtimeCallbacks,
  ): Promise<void> {
    this.disconnect();
    this.projectId = projectId;
    this.callbacks = callbacks;
    if (isMockMode) {
      this.setState("CONNECTED");
      await callbacks.onConnect();
      return;
    }

    this.setState("CONNECTING");
    try {
      if (this.projectId !== projectId) return;
      const socket = io(`${apiOrigin()}/cms`, {
        transports: ["websocket"],
        auth: async (callback) => {
          try {
            const token = await freshAccessToken();
            if (this.projectId === projectId) callback({ token, projectId });
          } catch {
            this.setState("DEGRADED");
          }
        },
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 500,
        reconnectionDelayMax: 10_000,
        randomizationFactor: 0.35,
      });
      this.socket = socket;
      socket.on("connect", () => {
        this.setState("CONNECTED");
        void callbacks.onConnect();
      });
      socket.on("disconnect", (reason) => {
        this.setState("DEGRADED");
        if (reason === "io server disconnect") socket.connect();
      });
      socket.on("connect_error", () => this.setState("DEGRADED"));
      for (const [eventName, handle] of Object.entries(
        callbacks.subscriptions,
      )) {
        socket.on(eventName, (value: unknown) => {
          void Promise.resolve(handle(value)).then((eventId) => {
            if (eventId) this.acknowledge(eventId, callbacks);
          });
        });
      }
    } catch {
      this.setState("DEGRADED");
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.projectId = null;
    this.callbacks = null;
    this.setState("DISCONNECTED");
  }

  private async acknowledge(
    eventId: string,
    callbacks: CmsRealtimeCallbacks,
  ): Promise<void> {
    const projectId = this.projectId;
    if (!projectId) return;
    if (this.socket?.connected) {
      this.socket.emit(callbacks.acknowledgement.socketEvent, { eventId });
      return;
    }
    await callbacks.acknowledgement.rest(projectId, eventId);
  }

  private setState(state: CmsRealtimeState): void {
    this.callbacks?.onStateChange(state);
  }
}

export const cmsRealtimeClient = new CmsRealtimeClient();
