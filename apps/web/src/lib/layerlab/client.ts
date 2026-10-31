import { LAYERLAB_ENDPOINT, type LayerLabStatus } from "@/lib/layerlab/types";

/** The page's side of the LayerLab route: every action is a JSON POST, a refusal throws its message. */
export async function layerLabCall<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(LAYERLAB_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `LayerLab could not do that (${response.status})`);
  return payload;
}

export async function layerLabUpload<T = Record<string, unknown>>(form: FormData): Promise<T> {
  const response = await fetch(LAYERLAB_ENDPOINT, { method: "POST", body: form, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `LayerLab could not do that (${response.status})`);
  return payload;
}

const DISABLED: LayerLabStatus = { enabled: false, storeEnabled: false, role: null };

/** Never throws: a copy without the route (static hosting) simply has no LayerLab. */
export async function fetchLayerLabStatus(): Promise<LayerLabStatus> {
  if (process.env.NEXT_PUBLIC_STATIC_EXPORT === "true") return DISABLED;
  try {
    return await layerLabCall<LayerLabStatus>("status");
  } catch {
    return DISABLED;
  }
}

/** A URL of one of LayerLab's files, for an <img> or for the editor to open. */
export function layerLabFileUrl(get: string, params: Record<string, string>) {
  return `${LAYERLAB_ENDPOINT}?${new URLSearchParams({ get, ...params }).toString()}`;
}
