export interface PrivateClawRelayEndpoints {
  providerWsUrl: string;
  appWsUrl: string;
}

export function resolveRelaySocketUrl(base: string, path: string): string {
  const rawUrl = new URL(base.includes("://") ? base : `ws://${base}`);
  if (rawUrl.protocol === "http:") {
    rawUrl.protocol = "ws:";
  }
  if (rawUrl.protocol === "https:") {
    rawUrl.protocol = "wss:";
  }
  rawUrl.pathname = path;
  rawUrl.search = "";
  rawUrl.hash = "";
  return rawUrl.toString();
}

export function resolveRelayEndpoints(baseUrl: string): PrivateClawRelayEndpoints {
  return {
    providerWsUrl: resolveRelaySocketUrl(baseUrl, "/ws/provider"),
    appWsUrl: resolveRelaySocketUrl(baseUrl, "/ws/app"),
  };
}
