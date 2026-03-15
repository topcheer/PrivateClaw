import { createSign } from "node:crypto";
import type { RelayPushRegistrationRecord } from "./push-registration-store.js";

const GOOGLE_FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface FcmServiceAccountCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface GoogleOAuthTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

interface GoogleFcmErrorDetail {
  "@type"?: unknown;
  errorCode?: unknown;
}

interface GoogleFcmErrorResponse {
  error?: {
    message?: unknown;
    details?: GoogleFcmErrorDetail[];
  };
}

export interface RelayPushSendResult {
  unregisterToken: boolean;
}

export interface RelayPushNotifier {
  readonly enabled: boolean;
  sendWake(
    registration: RelayPushRegistrationRecord,
  ): Promise<RelayPushSendResult>;
  close(): Promise<void>;
}

export class NoopRelayPushNotifier implements RelayPushNotifier {
  readonly enabled = false;

  async sendWake(): Promise<RelayPushSendResult> {
    return { unregisterToken: false };
  }

  async close(): Promise<void> {}
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function createJwtAssertion(credentials: FcmServiceAccountCredentials): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: GOOGLE_FCM_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(credentials.privateKey, "base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  return `${unsigned}.${signature}`;
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return undefined;
}

function parseServiceAccountFromJson(
  rawValue: string | undefined,
): FcmServiceAccountCredentials | undefined {
  if (!rawValue) {
    return undefined;
  }
  const parsed = parseJsonObject(rawValue);
  const projectId = parsed?.project_id;
  const clientEmail = parsed?.client_email;
  const privateKey = parsed?.private_key;
  if (
    typeof projectId !== "string" ||
    projectId.trim() === "" ||
    typeof clientEmail !== "string" ||
    clientEmail.trim() === "" ||
    typeof privateKey !== "string" ||
    privateKey.trim() === ""
  ) {
    throw new Error(
      "PRIVATECLAW_FCM_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key.",
    );
  }
  return {
    projectId: projectId.trim(),
    clientEmail: clientEmail.trim(),
    privateKey: privateKey.replaceAll("\\n", "\n"),
  };
}

function readFcmCredentials(params: {
  fcmServiceAccountJson?: string | undefined;
  fcmProjectId?: string | undefined;
  fcmClientEmail?: string | undefined;
  fcmPrivateKey?: string | undefined;
}): FcmServiceAccountCredentials | undefined {
  const fromJson = parseServiceAccountFromJson(params.fcmServiceAccountJson);
  if (fromJson) {
    return fromJson;
  }

  const projectId = params.fcmProjectId?.trim();
  const clientEmail = params.fcmClientEmail?.trim();
  const privateKey = params.fcmPrivateKey?.trim();
  if (!projectId && !clientEmail && !privateKey) {
    return undefined;
  }
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "PRIVATECLAW_FCM_PROJECT_ID, PRIVATECLAW_FCM_CLIENT_EMAIL, and PRIVATECLAW_FCM_PRIVATE_KEY must be provided together.",
    );
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replaceAll("\\n", "\n"),
  };
}

function toErrorMessage(
  status: number,
  payload: GoogleFcmErrorResponse | undefined,
): string {
  const remoteMessage = payload?.error?.message;
  if (typeof remoteMessage === "string" && remoteMessage.trim() !== "") {
    return `FCM request failed (${status}): ${remoteMessage}`;
  }
  return `FCM request failed with HTTP ${status}.`;
}

function shouldUnregisterToken(payload: GoogleFcmErrorResponse | undefined): boolean {
  const details = payload?.error?.details;
  if (!Array.isArray(details)) {
    return false;
  }
  return details.some((detail) => detail?.errorCode === "UNREGISTERED");
}

export class FcmRelayPushNotifier implements RelayPushNotifier {
  readonly enabled = true;

  private accessToken: string | undefined;
  private accessTokenExpiresAt = 0;

  constructor(private readonly credentials: FcmServiceAccountCredentials) {}

  private async getAccessToken(): Promise<string> {
    if (
      this.accessToken &&
      this.accessTokenExpiresAt > Date.now() + 60_000
    ) {
      return this.accessToken;
    }

    const assertion = createJwtAssertion(this.credentials);
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to obtain Google OAuth token (${response.status}).`,
      );
    }

    const payload = (await response.json()) as GoogleOAuthTokenResponse;
    if (
      typeof payload.access_token !== "string" ||
      typeof payload.expires_in !== "number"
    ) {
      throw new Error("Google OAuth token response is missing access token data.");
    }

    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt =
      Date.now() + Math.max(payload.expires_in * 1000, 60_000);
    return this.accessToken;
  }

  async sendWake(
    registration: RelayPushRegistrationRecord,
  ): Promise<RelayPushSendResult> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.credentials.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: registration.token,
            data: {
              type: "privateclaw.wake",
              sessionId: registration.sessionId,
              appId: registration.appId,
            },
            android: {
              priority: "high",
              ttl: "30s",
              collapseKey: registration.sessionId,
            },
            apns: {
              headers: {
                "apns-push-type": "background",
                "apns-priority": "5",
                "apns-collapse-id": registration.sessionId,
              },
              payload: {
                aps: {
                  "content-available": 1,
                },
              },
            },
          },
        }),
      },
    );

    if (response.ok) {
      return { unregisterToken: false };
    }

    let payload: GoogleFcmErrorResponse | undefined;
    try {
      payload = (await response.json()) as GoogleFcmErrorResponse;
    } catch {}

    if (shouldUnregisterToken(payload)) {
      return { unregisterToken: true };
    }

    throw new Error(toErrorMessage(response.status, payload));
  }

  async close(): Promise<void> {}
}

export function createRelayPushNotifier(params: {
  fcmServiceAccountJson?: string | undefined;
  fcmProjectId?: string | undefined;
  fcmClientEmail?: string | undefined;
  fcmPrivateKey?: string | undefined;
}): RelayPushNotifier {
  const credentials = readFcmCredentials(params);
  if (!credentials) {
    return new NoopRelayPushNotifier();
  }
  return new FcmRelayPushNotifier(credentials);
}
