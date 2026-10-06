import { Buffer } from "node:buffer";
import { createSign } from "node:crypto";

type ServiceAccountCredentials = {
  project_id?: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type CachedToken = {
  value: string;
  expiresAtMs: number;
};

let cachedToken: CachedToken | null = null;

function readServiceAccountCredentials(): ServiceAccountCredentials {
  const encoded = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (!encoded) {
    throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON_BASE64 is not configured.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64-encoded JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Google Cloud service account credentials are invalid.");
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.client_email !== "string" || typeof record.private_key !== "string") {
    throw new Error("Google Cloud service account credentials are missing client_email/private_key.");
  }

  return {
    project_id: typeof record.project_id === "string" ? record.project_id : undefined,
    client_email: record.client_email,
    private_key: record.private_key,
    token_uri: typeof record.token_uri === "string" ? record.token_uri : undefined
  };
}

function signServiceAccountJwt(credentials: ServiceAccountCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: tokenUri,
      iat: now,
      exp: now + 3600
    })
  ).toString("base64url");
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString("base64url");
  return `${signingInput}.${signature}`;
}

export function getGoogleCloudProjectId(): string {
  const explicit = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  if (explicit) return explicit;
  const credentials = readServiceAccountCredentials();
  if (credentials.project_id?.trim()) return credentials.project_id.trim();
  throw new Error("GOOGLE_CLOUD_PROJECT_ID is not configured and service account JSON has no project_id.");
}

export function isGoogleCloudServiceAccountConfigured(): boolean {
  try {
    void getGoogleCloudProjectId();
    const credentials = readServiceAccountCredentials();
    return Boolean(credentials.client_email && credentials.private_key);
  } catch {
    return false;
  }
}

export async function getGoogleCloudAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 5 * 60 * 1000) {
    return cachedToken.value;
  }

  const credentials = readServiceAccountCredentials();
  const tokenUri = credentials.token_uri ?? "https://oauth2.googleapis.com/token";
  const assertion = signServiceAccountJwt(credentials);
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google Cloud OAuth failed (${response.status}): ${payload.error_description ?? payload.error ?? "unknown_error"}`
    );
  }

  cachedToken = {
    value: payload.access_token,
    expiresAtMs: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000
  };
  return cachedToken.value;
}
