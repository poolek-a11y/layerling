import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import { orderedCadSketchPaths } from "@/lib/sketchCadProfile";
import { sketchBodyAnchor } from "@/lib/sketchPlacement";
import { sampledPath } from "@/lib/sketchStroke";
import type { SketchPoint, SketchProfile, SketchSegment, WorkplaneShape } from "@/types/layerling";

/*
 * The offset layer: the lines of the layer below, set in a little and drawn again as a stroke on
 * top of it. Each outline moves inward by less than its line is wide, so the new line rests on
 * the one below and the lower line still shows beside it: the stepped look of a layered mandala,
 * printable with no closed back because every line stands on a line.
 *
 * Works in the world's millimetres: the result is a sketch whose (0, 0) is the world's, to be
 * placed with its own middle at (0, 0).
 */

type Vec = { x: number; z: number };

export type OffsetSettings = {
  /** How far each outline moves inward, mm. */
  offset: number;
  /** The new layer's line width, mm. */
  line: number;
  /** Leave the outermost outline out (a whole ring of petals at once), so this layer is a step smaller. */
  dropOuter: boolean;
};

/** A layer's sketch lines in the world, closed loops and open lines apart. Bodies turned or tilted are skipped. */
export function worldLines(shapes: readonly WorkplaneShape[]) {
  const loops: Vec[][] = [];
  const open: Vec[][] = [];
  for (const shape of shapes) {
    if (!shape.sketchProfile || shape.rotation || shape.rotationX || shape.rotationZ || shape.mirrorX || shape.mirrorZ) continue;
    if (shape.sketchOperation && shape.sketchOperation !== "extrude") continue;
    const anchor = sketchBodyAnchor(shape);
    const dx = shape.x - anchor.x;
    const dz = shape.z - anchor.z;
    for (const path of orderedCadSketchPaths(shape.sketchProfile)) {
      const points = sampledPath(path).map((point) => ({ x: point.x + dx, z: point.z + dz }));
      if (path.closed && points.length >= 3) loops.push(points);
      else if (!path.closed && points.length >= 2) open.push(points);
    }
  }
  return { loops, open };
}

/** The selected layer's lines set in by `offset`, as a stroked sketch in world millimetres; null when nothing is left. */
export function offsetLayerProfile(runtime: ManifoldToplevel, shapes: readonly WorkplaneShape[], settings: OffsetSettings): SketchProfile | null {
  const { loops, open } = worldLines(shapes);
  let kept = loops;
  if (settings.dropOuter && loops.length > 1) {
    // The outermost outline: every loop that reaches as far from the middle as the furthest one
    // does (a ring of petals goes as a whole), measured from the middle of all the lines.
    const all = loops.flat();
    const cx = (Math.min(...all.map((point) => point.x)) + Math.max(...all.map((point) => point.x))) / 2;
    const cz = (Math.min(...all.map((point) => point.z)) + Math.max(...all.map((point) => point.z))) / 2;
    const reach = (loop: Vec[]) => Math.max(...loop.map((point) => Math.hypot(point.x - cx, point.z - cz)));
    const furthest = Math.max(...loops.map(reach));
    const inner = loops.filter((loop) => reach(loop) < furthest * 0.99);
    if (inner.length) kept = inner;
  }
  const made: CrossSection[] = [];
  const result: Vec[][] = [];
  try {
    for (const loop of kept) {
      const section = new runtime.CrossSection([loop.map((point) => [point.x, point.z] as [number, number])], "EvenOdd");
      made.push(section);
      const moved = settings.offset > 0 ? section.offset(-settings.offset, "Round", 2, 48) : section;
      if (moved !== section) made.push(moved);
      // An outline smaller than its own line closes up: it is left out rather than drawn as a blob.
      if (moved.area() < settings.line * settings.line) continue;
      for (const polygon of moved.toPolygons()) {
        if (polygon.length >= 3) result.push(polygon.map(([x, z]) => ({ x, z })));
      }
    }
  } finally {
    made.forEach((section) => section.delete());
  }
  if (!result.length && !open.length) return null;
  const points: SketchPoint[] = [];
  const segments: SketchSegment[] = [];
  const round = (value: number) => Math.round(value * 10000) / 10000;
  const add = (line: Vec[], closed: boolean, key: string) => {
    const ids = line.map((_, index) => `${key}-${index}`);
    line.forEach((point, index) => points.push({ id: ids[index], x: round(point.x), z: round(point.z), mode: "corner" }));
    const last = closed ? ids.length : ids.length - 1;
    for (let index = 0; index < last; index += 1) segments.push({ id: `${key}-s${index}`, startId: ids[index], endId: ids[(index + 1) % ids.length], kind: "line" });
  };
  result.forEach((loop, index) => add(loop, true, `o${index}`));
  open.forEach((line, index) => add(line, false, `l${index}`));
  return { points, segments, stroke: { width: settings.line, align: "center", join: "round", cap: "round" } };
}

/** The line width of the layer below, to start the offset layer from: the first stroked body's. */
export function strokeWidthOf(shapes: readonly WorkplaneShape[]) {
  return shapes.find((shape) => shape.sketchProfile?.stroke)?.sketchProfile?.stroke?.width ?? null;
}
