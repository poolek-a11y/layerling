import { createHash, randomBytes } from "crypto";
import { decodeSigned, encodeSigned, readCookie } from "@/lib/layerlab/session";

/**
 * "Sign in with Google" for LayerLab, so students and the teacher use their school accounts.
 * Only the basic sign-in (who you are) is asked for: no Drive, no Classroom data. Turning work in
 * on Google Classroom uses Google's own share page, which needs no setup here.
 *
 *   LAYERLAB_GOOGLE_CLIENT_ID       the OAuth client from Google Cloud ("Web application")
 *   LAYERLAB_GOOGLE_CLIENT_SECRET   its secret
 *   LAYERLAB_GOOGLE_DOMAINS         optional: only accounts of these school domains, comma-separated
 *   LAYERLAB_TEACHER_EMAILS         optional: Google accounts that sign in as the teacher, comma-separated
 *   LAYERLAB_PUBLIC_URL             optional: the site's address, when the proxy hides it
 */

type Environment = Record<string, string | undefined>;

export const GOOGLE_CALLBACK_PATH = "/api/layerlab/google";
export const GOOGLE_STATE_COOKIE = "layerlab_google_state";
export const GOOGLE_PENDING_COOKIE = "layerlab_google";
export const GOOGLE_STATE_SECONDS = 10 * 60;
export const GOOGLE_PENDING_SECONDS = 20 * 60;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function list(value: string | undefined) {
  return (value ?? "").split(",").map((entry) => entry.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
}

export function googleConfig(env: Environment = process.env) {
  const clientId = env.LAYERLAB_GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.LAYERLAB_GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    domains: list(env.LAYERLAB_GOOGLE_DOMAINS),
    teacherEmails: list(env.LAYERLAB_TEACHER_EMAILS),
  };
}

export type GoogleConfig = NonNullable<ReturnType<typeof googleConfig>>;

/** The site's own address as the browser sees it: Railway and other proxies pass it in X-Forwarded-*. */
export function publicOrigin(request: Request, env: Environment = process.env) {
  const configured = env.LAYERLAB_PUBLIC_URL?.trim();
  if (configured) return new URL(configured).origin;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() || url.protocol.replace(/:$/, "");
  return `${protocol}://${host}`;
}

export function googleRedirectUri(request: Request, env: Environment = process.env) {
  return `${publicOrigin(request, env)}${GOOGLE_CALLBACK_PATH}`;
}

/** Where to go after signing in: only a LayerLab page of this site. */
export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/layerlab") || value.startsWith("//")) return "/layerlab";
  return value;
}

/** The class code in a LayerLab link such as /layerlab?code=ABC234, which a Classroom post carries. */
export function classCodeIn(next: string) {
  try {
    return new URL(next, "http://x").searchParams.get("code")?.trim().toUpperCase() ?? "";
  } catch {
    return "";
  }
}

type GoogleState = { state: string; next: string };

export function startGoogleSignIn(request: Request, config: GoogleConfig, next: string) {
  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  // One school domain: Google shows only accounts of it. More than one is checked after sign-in.
  if (config.domains.length === 1) params.set("hd", config.domains[0]);
  return { url: `${AUTH_URL}?${params.toString()}`, cookie: encodeSigned("googleState", { state, next }) };
}

export function readGoogleState(request: Request) {
  return decodeSigned<GoogleState & Record<string, unknown>>("googleState", readCookie(request, GOOGLE_STATE_COOKIE), GOOGLE_STATE_SECONDS * 1000);
}

export type GoogleIdentity = {
  /** A hash of Google's account id: stable, and says nothing about the person by itself. */
  googleId: string;
  email: string;
  givenName: string;
  familyInitial: string;
};

export class GoogleSignInError extends Error {
  constructor(readonly reason: "domain" | "failed" | "unverified") {
    super(reason);
  }
}

export function googleIdFor(sub: string) {
  return createHash("sha256").update(`layerlab-google:${sub}`).digest("hex").slice(0, 32);
}

function decodeIdToken(idToken: string) {
  const [, payload] = idToken.split(".");
  if (!payload) throw new GoogleSignInError("failed");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

/**
 * Trades the code Google sent back for the account. The ID token comes straight from Google's token
 * endpoint over HTTPS with the client secret, so its claims can be read without checking its signature.
 */
export async function finishGoogleSignIn(request: Request, config: GoogleConfig, code: string, now = Date.now()): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!response.ok) {
    console.warn("layerlab: Google refused the sign-in", response.status, await response.text().catch(() => ""));
    throw new GoogleSignInError("failed");
  }
  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) throw new GoogleSignInError("failed");
  const claims = decodeIdToken(tokens.id_token);
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  const audienceOk = claims.aud === config.clientId;
  const fresh = typeof claims.exp === "number" && claims.exp * 1000 > now;
  if (!issuerOk || !audienceOk || !fresh || typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new GoogleSignInError("failed");
  }
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new GoogleSignInError("unverified");
  const email = claims.email.toLowerCase();
  const isTeacher = config.teacherEmails.includes(email);
  const domain = typeof claims.hd === "string" ? claims.hd.toLowerCase() : "";
  if (config.domains.length && !isTeacher && !config.domains.includes(domain)) throw new GoogleSignInError("domain");
  const givenName = (typeof claims.given_name === "string" && claims.given_name.trim())
    || (typeof claims.name === "string" && claims.name.trim().split(/\s+/)[0])
    || email.split("@")[0];
  const family = typeof claims.family_name === "string" ? claims.family_name.trim() : "";
  return {
    googleId: googleIdFor(claims.sub),
    email,
    givenName: givenName.slice(0, 30),
    familyInitial: family ? family[0].toUpperCase() : "",
  };
}

export function isTeacherEmail(config: GoogleConfig, email: string) {
  return config.teacherEmails.includes(email.toLowerCase());
}

/** A student who signed in with Google but has no class yet: they type a code or pick a class. */
export type GooglePending = { googleId: string; givenName: string; familyInitial: string };

export function encodePending(identity: GooglePending) {
  return encodeSigned("googlePending", { googleId: identity.googleId, givenName: identity.givenName, familyInitial: identity.familyInitial });
}

export function pendingFromRequest(request: Request): GooglePending | null {
  const value = decodeSigned<GooglePending & Record<string, unknown>>("googlePending", readCookie(request, GOOGLE_PENDING_COOKIE), GOOGLE_PENDING_SECONDS * 1000);
  if (!value || typeof value.googleId !== "string" || !/^[a-f0-9]{32}$/.test(value.googleId) || typeof value.givenName !== "string") return null;
  return { googleId: value.googleId, givenName: value.givenName, familyInitial: typeof value.familyInitial === "string" ? value.familyInitial : "" };
}
