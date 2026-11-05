import { LAYERLAB_ENDPOINT } from "@/lib/layerlab/types";

/**
 * How the LayerLab page hands a design to the editor: a link to the start page that names it.
 *
 *   ?layerlab=new                                  a new design, which for a student starts in their server folder
 *   ?layerlab=open&path=<folder>&file=<name.lyl>   a student's own design, opened from their server folder,
 *                                                  so saving goes back into it (and becomes an iteration)
 *   ?layerlab=copy&src=<LayerLab file URL>         a copy for this browser: the teacher looking at a
 *                                                  student's design or one of its iterations
 */

export type LayerLabOpenRequest =
  | { kind: "new" }
  | { kind: "open"; path: string; fileName: string }
  | { kind: "copy"; src: string };

export const LAYERLAB_NEW_DESIGN_URL = "/?layerlab=new";

export function layerLabOpenUrl(path: string, fileName: string) {
  return `/?${new URLSearchParams({ layerlab: "open", path, file: fileName }).toString()}`;
}

export function layerLabCopyUrl(src: string) {
  return `/?${new URLSearchParams({ layerlab: "copy", src }).toString()}`;
}

export function readLayerLabOpenRequest(search: string): LayerLabOpenRequest | null {
  const params = new URLSearchParams(search);
  const kind = params.get("layerlab");
  if (kind === "new") return { kind };
  if (kind === "open") {
    const fileName = params.get("file") ?? "";
    if (!/\.(lyl|skf)$/i.test(fileName) || fileName.includes("/")) return null;
    return { kind, path: params.get("path") ?? "", fileName };
  }
  if (kind === "copy") {
    const src = params.get("src") ?? "";
    // Only LayerLab's own files: a link must not make the editor fetch from anywhere else.
    if (!src.startsWith(`${LAYERLAB_ENDPOINT}?`)) return null;
    return { kind, src };
  }
  return null;
}

/** The address without the request, so a reload does not open the design a second time. */
export function withoutLayerLabOpenRequest(href: string) {
  const url = new URL(href);
  for (const name of ["layerlab", "path", "file", "src"]) url.searchParams.delete(name);
  return `${url.pathname}${url.search}${url.hash}`;
}
