import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { getLocalUser } from "./local-auth";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

type AccessClaims = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  name?: string;
  nbf?: number;
  sub?: string;
};

type RuntimeAuthEnv = {
  ACCESS_AUD?: string;
  ACCESS_READY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  AUTH_PROVIDER?: string;
};

const runtimeAuthEnv = env as unknown as RuntimeAuthEnv;
type AccessJwk = JsonWebKey & { kid?: string };
let cachedJwks: { expiresAt: number; keys: AccessJwk[] } | null = null;

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (userId && email) {
    const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
    const fullName =
      encodedFullName &&
      requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
        ? safeDecodeURIComponent(encodedFullName)
        : null;

    return {
      userId,
      displayName: fullName ?? email,
      email,
      fullName,
    };
  }

  if (
    runtimeAuthEnv.AUTH_PROVIDER === "local"
  ) {
    return getLocalUser();
  }

  if (
    runtimeAuthEnv.AUTH_PROVIDER !== "cloudflare-access" ||
    runtimeAuthEnv.ACCESS_READY !== "true"
  ) {
    return null;
  }

  const token = requestHeaders.get("cf-access-jwt-assertion");
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims?.email) return null;
  const fullName = typeof claims.name === "string" ? claims.name : null;

  return {
    userId: `cloudflare:${claims.sub ?? claims.email.toLowerCase()}`,
    displayName: fullName ?? claims.email,
    email: claims.email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  if (runtimeAuthEnv.AUTH_PROVIDER === "cloudflare-access") {
    redirect("/access-required");
  }
  if (runtimeAuthEnv.AUTH_PROVIDER === "local") {
    redirect(`/login?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`);
  }

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  if (runtimeAuthEnv.AUTH_PROVIDER === "cloudflare-access") {
    return "/cdn-cgi/access/logout";
  }
  if (runtimeAuthEnv.AUTH_PROVIDER === "local") {
    return "/api/auth/logout";
  }
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
    || pathname === "/login"
    || pathname.startsWith("/api/auth/")
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  const teamDomain = runtimeAuthEnv.ACCESS_TEAM_DOMAIN;
  const expectedAudience = runtimeAuthEnv.ACCESS_AUD;
  if (!teamDomain || !expectedAudience) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(decodeBase64UrlText(parts[0])) as { alg?: string; kid?: string };
    const claims = JSON.parse(decodeBase64UrlText(parts[1])) as AccessClaims;
    if (header.alg !== "RS256" || !header.kid) return null;

    const normalizedTeamDomain = teamDomain.replace(/\/$/, "");
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== normalizedTeamDomain ||
      !audiences.includes(expectedAudience) ||
      typeof claims.exp !== "number" ||
      claims.exp <= now ||
      (typeof claims.nbf === "number" && claims.nbf > now)
    ) {
      return null;
    }

    const jwks = await getAccessJwks(normalizedTeamDomain);
    const jwk = jwks.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeBase64UrlBytes(parts[2]).buffer as ArrayBuffer,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return verified ? claims : null;
  } catch {
    return null;
  }
}

async function getAccessJwks(teamDomain: string): Promise<AccessJwk[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;
  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Unable to load Cloudflare Access signing keys");
  const payload = (await response.json()) as { keys?: AccessJwk[] };
  if (!Array.isArray(payload.keys)) throw new Error("Invalid Cloudflare Access signing keys");
  cachedJwks = { keys: payload.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return payload.keys;
}

function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
