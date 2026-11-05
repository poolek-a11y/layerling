import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Who is signed in to LayerLab, the classroom of layerling. A teacher signs in with the password
 * from `LAYERLAB_TEACHER_PASSWORD`; a student joins a class with its code, a name and a PIN.
 * Both end up as a signed cookie, so the shared-projects route can tell synchronously whose
 * folder a request belongs to without reading anything from disk.
 */

export const LAYERLAB_TEACHER_PASSWORD_ENV = "LAYERLAB_TEACHER_PASSWORD";
export const LAYERLAB_SECRET_ENV = "LAYERLAB_SECRET";
export const LAYERLAB_COOKIE = "layerlab_session";
/** A school term; signing in again after that is no hardship. */
export const LAYERLAB_SESSION_SECONDS = 120 * 24 * 60 * 60;

type Environment = Record<string, string | undefined>;

export type LayerLabSession =
  | { role: "teacher"; issuedAt: number }
  | { role: "student"; classId: string; studentId: string; issuedAt: number };

export function layerLabEnabled(env: Environment = process.env) {
  return Boolean(env[LAYERLAB_TEACHER_PASSWORD_ENV]?.trim());
}

function sessionSecret(env: Environment) {
  const secret = env[LAYERLAB_SECRET_ENV]?.trim();
  if (secret) return secret;
  // Without a secret of its own the password stands in: changing it then signs everybody out.
  return createHash("sha256").update(`layerlab:${env[LAYERLAB_TEACHER_PASSWORD_ENV]?.trim() ?? ""}`).digest("hex");
}

function signature(payload: string, env: Environment) {
  return createHmac("sha256", sessionSecret(env)).update(payload).digest("base64url");
}

export function encodeSession(session: LayerLabSession, env: Environment = process.env) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signature(payload, env)}`;
}

const ID_PATTERN = /^[a-z0-9]{6,32}$/;

export function decodeSession(value: string | null | undefined, env: Environment = process.env, now = Date.now()): LayerLabSession | null {
  if (!value || !layerLabEnabled(env)) return null;
  const [payload, given] = value.split(".");
  if (!payload || !given) return null;
  const expected = Buffer.from(signature(payload, env));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<LayerLabSession> & Record<string, unknown>;
    if (typeof parsed.issuedAt !== "number" || now - parsed.issuedAt > LAYERLAB_SESSION_SECONDS * 1000) return null;
    if (parsed.role === "teacher") return { role: "teacher", issuedAt: parsed.issuedAt };
    if (parsed.role === "student" && typeof parsed.classId === "string" && typeof parsed.studentId === "string"
      && ID_PATTERN.test(parsed.classId) && ID_PATTERN.test(parsed.studentId)) {
      return { role: "student", classId: parsed.classId, studentId: parsed.studentId, issuedAt: parsed.issuedAt };
    }
  } catch {
    // not ours
  }
  return null;
}

export function readCookie(request: Request, name = LAYERLAB_COOKIE) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionFromRequest(request: Request, env: Environment = process.env) {
  return decodeSession(readCookie(request), env);
}

/** The cookie that signs in (or, with `null`, out). Secure whenever the page itself came over HTTPS. */
export function sessionCookie(request: Request, session: LayerLabSession | null, env: Environment = process.env) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const secure = (forwarded || new URL(request.url).protocol.replace(/:$/, "")) === "https";
  const value = session ? encodeURIComponent(encodeSession(session, env)) : "";
  const maxAge = session ? LAYERLAB_SESSION_SECONDS : 0;
  return `${LAYERLAB_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function teacherPasswordMatches(given: string, env: Environment = process.env) {
  const configured = env[LAYERLAB_TEACHER_PASSWORD_ENV]?.trim();
  if (!configured) return false;
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function pinMatches(pin: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The folder under `.users/` of the shared store that holds a student's designs. Ids are lowercase
 * letters and digits only, so this is always one safe path segment.
 */
export function studentStoreFolder(classId: string, studentId: string) {
  return `layerlab-${classId}-${studentId}`;
}

/** For the shared-projects route: the student's own folder, or null for everybody else. */
export function layerLabUserFolder(request: Request, env: Environment = process.env) {
  const session = sessionFromRequest(request, env);
  return session?.role === "student" ? studentStoreFolder(session.classId, session.studentId) : null;
}

/**
 * Whether the shared store is closed to this request: LayerLab is on and nobody is signed in to it.
 * The site is public, so without this anyone with the link could open the teacher's server designs.
 */
export function layerLabClosesStore(request: Request, env: Environment = process.env) {
  return layerLabEnabled(env) && !sessionFromRequest(request, env);
}
