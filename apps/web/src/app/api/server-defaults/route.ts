import { NextResponse } from "next/server";
import { serverDefaultsFromEnvironment } from "@/lib/serverDefaults";
import { layerLabUserFolder } from "@/lib/layerlab/session";

// A static export insists on this line for any route; it builds the module once there, and the page
// never asks in such a copy.
export const revalidate = false;

/**
 * What this server suggests to people who have not chosen yet; see `LAYERLING_DEFAULT_THEME` in the
 * README. It is a POST on purpose: Next answers a route that has any method besides GET on every
 * call, so the answer is the environment of the running server. A GET-only route is rendered once
 * at build time and would freeze the setting of whoever built the Docker image.
 */
export function POST(request: Request) {
  const defaults = serverDefaultsFromEnvironment(process.env);
  // A LayerLab student's new designs belong in their class folder, where the teacher sees them.
  if (layerLabUserFolder(request)) defaults.newDesignsOnServer = "always";
  return NextResponse.json(defaults, { headers: { "Cache-Control": "no-store" } });
}
