import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { ShapeKind, WorkplaneShape } from "@/types/layerling";
import type { CheckResult, LessonScene } from "@/lib/lessons/types";

/**
 * Small helpers the lesson checks are written with. They work on boxes around each shape
 * (good enough to tell "touches", "sits on top of" or "is the right size"), never on the exact
 * geometry, so a check can run on every change without slowing the editor down.
 */

export const IN = 25.4;
export const inches = (value: number) => value * IN;

export type Box = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

export type Part = {
  shape: WorkplaneShape;
  kind: ShapeKind;
  hole: boolean;
  box: Box;
  /** Centre and size of the box, mm. */
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
  /** The top-level object it belongs to (itself, or the group it was grouped into). */
  topId: string;
};

function boxOf(shape: WorkplaneShape): Box {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  const bottom = shape.elevation ?? 0;
  const tilted = Math.abs(shape.rotationX ?? 0) > 0.5 || Math.abs(shape.rotationZ ?? 0) > 0.5;
  if (tilted) {
    // Tilted out of the workplane: a sphere around the box holds it in any direction.
    const radius = Math.hypot(width, depth, height) / 2;
    const midY = bottom + height / 2;
    return { minX: shape.x - radius, maxX: shape.x + radius, minY: Math.max(0, midY - radius), maxY: midY + radius, minZ: shape.z - radius, maxZ: shape.z + radius };
  }
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180;
  const halfX = (Math.abs(Math.cos(turn)) * width + Math.abs(Math.sin(turn)) * depth) / 2;
  const halfZ = (Math.abs(Math.sin(turn)) * width + Math.abs(Math.cos(turn)) * depth) / 2;
  return { minX: shape.x - halfX, maxX: shape.x + halfX, minY: bottom, maxY: bottom + height, minZ: shape.z - halfZ, maxZ: shape.z + halfZ };
}

function partOf(shape: WorkplaneShape, topId: string): Part {
  const box = boxOf(shape);
  return {
    shape,
    kind: shape.kind,
    hole: Boolean(shape.hole),
    box,
    cx: (box.minX + box.maxX) / 2,
    cy: (box.minY + box.maxY) / 2,
    cz: (box.minZ + box.maxZ) / 2,
    w: box.maxX - box.minX,
    h: box.maxY - box.minY,
    d: box.maxZ - box.minZ,
    topId,
  };
}

/**
 * A grouped part placed in the world. The editor keeps a group's parts in the group's own frame
 * (centred on it, from its bottom) and stretches them with the group, so a moved or resized
 * group moves its parts with it. Tilts of a whole group are left out: the box checks don't need them.
 */
function placeChild(group: WorkplaneShape, child: WorkplaneShape, scale: [number, number, number]): WorkplaneShape {
  const [sx, sy, sz] = scale;
  const turn = ((group.rotation ?? 0) * Math.PI) / 180;
  const lx = child.x * sx;
  const lz = child.z * sz;
  const width = shapeWidth(child) * sx;
  const depth = shapeDepth(child) * sz;
  return {
    ...child,
    x: group.x + lx * Math.cos(turn) + lz * Math.sin(turn),
    z: group.z - lx * Math.sin(turn) + lz * Math.cos(turn),
    elevation: (group.elevation ?? 0) + (child.elevation ?? 0) * sy,
    width,
    depth,
    size: Math.max(width, depth),
    height: child.height * sy,
    rotation: (child.rotation ?? 0) + (group.rotation ?? 0),
  };
}

function groupScale(group: WorkplaneShape): [number, number, number] {
  const children = group.groupedShapes ?? [];
  const bounds = children.map((child) => boxOf(child));
  const span = (low: (box: Box) => number, high: (box: Box) => number) => Math.max(...bounds.map(high)) - Math.min(...bounds.map(low));
  const baseW = group.groupedBaseWidth ?? span((box) => box.minX, (box) => box.maxX);
  const baseH = group.groupedBaseHeight ?? span((box) => box.minY, (box) => box.maxY);
  const baseD = group.groupedBaseDepth ?? span((box) => box.minZ, (box) => box.maxZ);
  return [shapeWidth(group) / Math.max(0.001, baseW), group.height / Math.max(0.001, baseH), shapeDepth(group) / Math.max(0.001, baseD)];
}

/** Every single shape, grouped ones included, placed in the world and tagged with the top-level object it is in. */
export function allParts(scene: LessonScene): Part[] {
  const out: Part[] = [];
  const walk = (shape: WorkplaneShape, topId: string) => {
    if (shape.groupedShapes?.length) {
      const scale = groupScale(shape);
      shape.groupedShapes.forEach((child) => walk(placeChild(shape, child, scale), topId));
    } else out.push(partOf(shape, topId));
  };
  for (const shape of scene.shapes) {
    if (shape.kind === "ruler") continue;
    walk(shape, shape.id);
  }
  return out;
}

export const solids = (scene: LessonScene) => allParts(scene).filter((part) => !part.hole);
export const holes = (scene: LessonScene) => allParts(scene).filter((part) => part.hole);

/** The objects at the top of the list (a group counts once). */
export function topObjects(scene: LessonScene) {
  return scene.shapes.filter((shape) => shape.kind !== "ruler").map((shape) => partOf(shape, shape.id));
}

export const between = (value: number, low: number, high: number) => value >= low && value <= high;

/** The boxes overlap or touch, with `gap` mm of slack. */
export function touches(a: Part, b: Part, gap = 0.6) {
  return a.box.minX <= b.box.maxX + gap && b.box.minX <= a.box.maxX + gap
    && a.box.minY <= b.box.maxY + gap && b.box.minY <= a.box.maxY + gap
    && a.box.minZ <= b.box.maxZ + gap && b.box.minZ <= a.box.maxZ + gap;
}

const ROUND_KINDS: ShapeKind[] = ["sphere", "ellipse"];

export const pass = (message?: string): CheckResult => ({ ok: true, message });
export const fail = (message: string): CheckResult => ({ ok: false, message });

/* ---------- the parts of a kokeshi ---------- */

/** The body: the biggest solid standing on the workplane. */
export function findBody(scene: LessonScene) {
  const standing = solids(scene).filter((part) => part.box.minY < 1.5 && part.h > inches(1.5));
  return standing.sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d)[0] ?? null;
}

/** The head: a round part on top of the body. Hair made from a bigger copy of the head is round too, so the smallest one wins. */
export function findHead(scene: LessonScene) {
  const body = findBody(scene);
  if (!body) return null;
  const round = solids(scene).filter((part) => ROUND_KINDS.includes(part.kind) && part.cy > body.box.maxY - inches(0.5) && part.w > inches(1.5));
  return round.sort((a, b) => a.w - b.w)[0] ?? null;
}

/** The obi: a ring-shaped or round part around the body's middle, wider than the body, short. */
export function findObi(scene: LessonScene) {
  const body = findBody(scene);
  if (!body) return null;
  return solids(scene).find((part) => part !== body
    && part.w >= body.w * 0.9 && part.w <= body.w + inches(1)
    && between(part.h, inches(0.25), inches(0.8))
    && part.box.minY > body.box.minY + inches(0.5) && part.box.maxY < body.box.maxY + inches(0.2)
    && Math.abs(part.cx - body.cx) < inches(0.3)) ?? null;
}

/** Parts that are not the body, head or obi: everything the student added after. */
export function extras(scene: LessonScene) {
  const known = new Set([findBody(scene), findHead(scene), findObi(scene)].filter(Boolean));
  return solids(scene).filter((part) => !known.has(part));
}

/** Two parts of nearly the same size placed as mirror images left and right of `centreX`. */
export function mirroredPair(parts: Part[], centreX: number, tolerance = 1.2) {
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i];
      const b = parts[j];
      const sameSize = Math.abs(a.w - b.w) < tolerance && Math.abs(a.h - b.h) < tolerance && Math.abs(a.d - b.d) < tolerance;
      const mirrored = Math.abs((a.cx - centreX) + (b.cx - centreX)) < tolerance && Math.abs(a.cy - b.cy) < tolerance && Math.abs(a.cz - b.cz) < tolerance;
      const apart = Math.abs(a.cx - b.cx) > tolerance * 2;
      if (sameSize && mirrored && apart) return [a, b] as const;
    }
  }
  return null;
}

/* ---------- checks every printable design needs ---------- */

/** Top-level objects that do not touch the rest of the design, directly or through others. */
export function floatingObjects(scene: LessonScene) {
  const parts = solids(scene);
  if (parts.length < 2) return [];
  const body = findBody(scene) ?? parts.sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d)[0];
  const reached = new Set<Part>([body]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const part of parts) {
      if (reached.has(part)) continue;
      // A part grouped with something already reached is held by that group.
      if ([...reached].some((other) => other.topId === part.topId || touches(other, part))) {
        reached.add(part);
        grew = true;
      }
    }
  }
  return parts.filter((part) => !reached.has(part));
}

/** Parts thinner than `minimum` mm in some direction (by their box, so a thin wall inside a big part is not seen). */
export function thinParts(scene: LessonScene, minimum = inches(0.05)) {
  return solids(scene).filter((part) => Math.min(part.w, part.h, part.d) < minimum - 0.05);
}

export function connectedAndPrintable(scene: LessonScene): CheckResult {
  const floating = floatingObjects(scene);
  if (floating.length) return fail(`${floating.length === 1 ? "One part is" : `${floating.length} parts are`} not touching the doll. Move ${floating.length === 1 ? "it" : "them"} until ${floating.length === 1 ? "it touches" : "they touch"}.`);
  const thin = thinParts(scene);
  if (thin.length) return fail(`${thin.length === 1 ? "One part is" : `${thin.length} parts are`} thinner than 0.05 in. Make ${thin.length === 1 ? "it" : "them"} a little thicker so ${thin.length === 1 ? "it prints" : "they print"}.`);
  return pass();
}

/** A length in mm as inches in 64ths, the way the editor's rulers and handles show it: "2 5/8 in", "55/64 in". */
export function formatInches(mm: number) {
  return `${fraction(mm / IN)} in`;
}

export function fraction(inchValue: number) {
  const steps = Math.round(Math.abs(inchValue) * 64);
  const whole = Math.floor(steps / 64);
  let part = steps % 64;
  let den = 64;
  while (part && part % 2 === 0) {
    part /= 2;
    den /= 2;
  }
  const sign = inchValue < 0 && steps ? "-" : "";
  if (!part) return `${sign}${whole}`;
  return whole ? `${sign}${whole} ${part}/${den}` : `${sign}${part}/${den}`;
}

/** Parts grouped together with holes in the same top-level object. */
export const isHollowed = (part: Part) => Boolean(part.shape.edgeTreatments?.some((entry) => entry.kind === "shell"));
