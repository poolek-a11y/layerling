import { cadShapeFromSketchProfile } from "@/lib/editorSketchCad";
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { createLocalId } from "@/lib/localIds";
import { buildMotifLayer, type MotifLayer, type MotifParams } from "@/lib/lessons/mandalaMotifs";
import { offsetLayerProfile, type OffsetSettings } from "@/lib/lessons/mandalaOffset";
import { strokedSketchProfile } from "@/lib/sketchStroke";
import { sketchBodyAnchor } from "@/lib/sketchPlacement";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { MandalaPlace } from "@/lib/lessons/mandalaPlace";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * A mandala layer from the shape builders as a body in the design. The layer goes on the middle
 * of what is selected, on top of it, so a student stacks a mandala by selecting the layer below
 * and adding the next; with nothing selected it stands on the middle of the plate.
 */

/**
 * The layer built by the CAD kernel as an ordinary sketch body: the student can open the sketch,
 * move points and change the line width. Where the kernel cannot stroke the outlines (many
 * crossing curves), the stroke's outline is worked out here and built as a filled area instead.
 */
export async function buildMandalaLayer(builderId: string, params: Partial<MotifParams>, place: MandalaPlace): Promise<WorkplaneShape> {
  return buildLayerShape(buildMotifLayer(builderId, params), place);
}

/** Offset layer colours, one after another up the stack, for a print that changes filament at each layer. */
const OFFSET_COLOURS = ["#e7399e", "#ff9e2c", "#2fbf71", "#16c0d4", "#ffc93c", "#8a5bf0"];

/**
 * The offset layer (mandalaOffset.ts) of the selected bodies, on top of them: their lines set in
 * and stroked again, so it rests on them and they still show beside it.
 */
export async function buildOffsetLayer(selected: readonly WorkplaneShape[], settings: OffsetSettings, elevation: number, layerNumber: number): Promise<WorkplaneShape> {
  const profile = offsetLayerProfile(await getManifoldRuntime(), selected, settings);
  if (!profile) throw new Error("Nothing is left to offset. Select a layer built from a sketch (a shape builder ring or your own sketch), or make the offset smaller.");
  const height = selected.reduce((thinnest, shape) => Math.min(thinnest, shape.height), Number.POSITIVE_INFINITY);
  return buildLayerShape({
    name: `Offset layer ${layerNumber}`,
    color: OFFSET_COLOURS[(layerNumber - 2 + OFFSET_COLOURS.length) % OFFSET_COLOURS.length],
    profile,
    height: Number.isFinite(height) ? Math.min(height, 5) : 2.5,
    diameter: 0,
  }, { x: 0, z: 0, elevation });
}

async function buildLayerShape(layer: MotifLayer, place: MandalaPlace): Promise<WorkplaneShape> {
  let built: WorkplaneShape;
  try {
    built = await cadShapeFromSketchProfile(layer.profile, layer.height);
  } catch (error) {
    if (!layer.profile.stroke) throw error;
    const area = strokedSketchProfile(await getManifoldRuntime(), layer.profile);
    if (!area) throw error;
    built = await cadShapeFromSketchProfile(area, layer.height);
  }
  // A body stands with the middle of its outline under its x and z; the sketch's own (0, 0), the
  // mandala's middle, goes on the place (an odd number of petals is not centred in its box).
  const anchor = sketchBodyAnchor(built);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return canonicalizeShape({
    ...built,
    id: createLocalId("mandala-layer"),
    name: layer.name,
    color: layer.color,
    hole: false,
    x: round(place.x + anchor.x),
    z: round(place.z + anchor.z),
    elevation: place.elevation,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
  });
}
