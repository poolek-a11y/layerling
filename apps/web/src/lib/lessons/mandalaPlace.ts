import { sketchBodyAnchor } from "@/lib/sketchPlacement";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Where a mandala's middle is, for the shape builders (a new ring goes on top of the selection,
 * on its middle) and for the lesson's checks (every layer centred on the base).
 */

export type MandalaPlace = { x: number; z: number; elevation: number };

/**
 * The middle of a mandala layer in the world: for a sketch body standing level, the sketch's own
 * (0, 0), where the builder put the ring's middle (an odd number of petals is not centred in its
 * box); for anything else the middle of its box.
 */
export function mandalaCentreOf(shape: WorkplaneShape, box: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const level = !shape.rotation && !shape.rotationX && !shape.rotationZ && !shape.mirrorX && !shape.mirrorZ;
  if (shape.sketchProfile && level && (!shape.sketchOperation || shape.sketchOperation === "extrude") && !shape.groupedShapes?.length) {
    const anchor = sketchBodyAnchor(shape);
    return { x: shape.x - anchor.x, z: shape.z - anchor.z };
  }
  return { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
}

/** Where the next layer goes: on top of the selected bodies, on their middle; else the plate's middle. */
export function mandalaPlaceOn(selected: readonly WorkplaneShape[], box: { minX: number; maxX: number; maxY: number; minZ: number; maxZ: number } | null): MandalaPlace {
  if (!selected.length || !box) return { x: 0, z: 0, elevation: 0 };
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const centre = selected.length === 1 ? mandalaCentreOf(selected[0], box) : { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
  return { x: round(centre.x), z: round(centre.z), elevation: round(box.maxY) };
}

