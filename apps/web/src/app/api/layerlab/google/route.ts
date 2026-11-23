import { NextResponse } from "next/server";
import {
  classCodeIn,
  encodePending,
  finishGoogleSignIn,
  GOOGLE_PENDING_COOKIE,
  GOOGLE_PENDING_SECONDS,
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_SECONDS,
  googleConfig,
  GoogleSignInError,
  isTeacherEmail,
  publicOrigin,
  readGoogleState,
  safeNext,
  startGoogleSignIn,
} from "@/lib/layerlab/google";
import { placeGoogleStudent } from "@/lib/layerlab/googleJoin";
import { layerLabEnabled, plainCookie, sessionCookie } from "@/lib/layerlab/session";
import { LayerLabError } from "@/lib/layerlab/store";

/**
 * Sign in with Google. One address does both halves, so the teacher registers a single redirect URI:
 *
 *   /api/layerlab/google?next=/layerlab?code=ABC234   sends the browser to Google
 *   /api/layerlab/google?code=...&state=...           Google sends it back here
 */

export const runtime = "nodejs";
export const revalidate = false;

function redirect(request: Request, target: string, cookies: string[]) {
  const response = NextResponse.redirect(`${publicOrigin(request)}${target}`, 303);
  response.headers.set("Cache-Control", "no-store");
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  return response;
}

function withParam(next: string, name: string, value: string) {
  const url = new URL(next, "http://x");
  url.searchParams.set(name, value);
  return `${url.pathname}${url.search}`;
}

export async function GET(request: Request) {
  const config = googleConfig();
  if (!layerLabEnabled() || !config) {
    return NextResponse.json({ error: "Google sign-in is not set up on this server" }, { status: 404 });
  }
  const url = new URL(request.url);
  const clearState = plainCookie(request, GOOGLE_STATE_COOKIE, null, 0);

  // Out to Google.
  if (!url.searchParams.has("state")) {
    const start = startGoogleSignIn(request, config, safeNext(url.searchParams.get("next")));
    const response = NextResponse.redirect(start.url, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.append("Set-Cookie", plainCookie(request, GOOGLE_STATE_COOKIE, start.cookie, GOOGLE_STATE_SECONDS));
    return response;
  }

  // Back from Google.
  const saved = readGoogleState(request);
  const next = safeNext(saved?.next);
  const code = url.searchParams.get("code");
  if (!saved || saved.state !== url.searchParams.get("state")) return redirect(request, withParam(next, "google", "expired"), [clearState]);
  if (!code) return redirect(request, withParam(next, "google", "cancelled"), [clearState]);

  try {
    const identity = await finishGoogleSignIn(request, config, code);
    if (isTeacherEmail(config, identity.email)) {
      return redirect(request, next, [clearState, sessionCookie(request, { role: "teacher", issuedAt: Date.now() })]);
    }
    const classCode = classCodeIn(next);
    let placed: Awaited<ReturnType<typeof placeGoogleStudent>> | null = null;
    try {
      placed = await placeGoogleStudent(identity, { code: classCode || undefined });
    } catch (error) {
      // A wrong or old class code in the link: let them type the right one.
      if (!(error instanceof LayerLabError)) throw error;
    }
    if (placed && "session" in placed) {
      return redirect(request, next, [
        clearState,
        plainCookie(request, GOOGLE_PENDING_COOKIE, null, 0),
        sessionCookie(request, placed.session),
      ]);
    }
    return redirect(request, withParam(next, "google", "continue"), [
      clearState,
      sessionCookie(request, null),
      plainCookie(request, GOOGLE_PENDING_COOKIE, encodePending(identity), GOOGLE_PENDING_SECONDS),
    ]);
  } catch (error) {
    const reason = error instanceof GoogleSignInError ? error.reason : "failed";
    if (!(error instanceof GoogleSignInError)) console.error("layerlab: Google sign-in", error);
    return redirect(request, withParam(next, "google", reason), [clearState]);
  }
}
