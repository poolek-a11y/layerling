import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { OcctKernel } from "occt-wasm";
import { buildStrokedSketchSolid } from "@/lib/cadSketchStroke";
import { buildMotifLayer, MOTIF_BUILDERS } from "@/lib/lessons/mandalaMotifs";
import { offsetLayerProfile } from "@/lib/lessons/mandalaOffset";
import { cadSketchRegions } from "@/lib/sketchCadProfile";
import { pathWire } from "@/lib/sketchCadWire";
import { strokedSketchProfile } from "@/lib/sketchStroke";
import type { SketchProfile, WorkplaneShape } from "@/types/layerling";

/*
 * Every mandala shape builder's ring built the way the sketch worker builds it: the kernel strokes
 * the outlines, and where it cannot, the stroke's outline is worked out with Manifold and built as
 * an area (as lib/lessons/mandalaBuild.ts does). Every ring must come out as a sound solid.
 */

describe("mandala shape builders with the real OCCT kernel", () => {
  let kernel: OcctKernel;
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    kernel = await OcctKernel.init({ wasm });
    runtime = await manifoldModule();
    runtime.setup();
  });

  function extrudeArea(profile: SketchProfile, height: number) {
    const regions = cadSketchRegions(profile);
    expect(regions.length).toBeGreaterThan(0);
    // The worker's own path for a filled sketch (workers/sketchCad.worker.ts).
    const solids = regions.map((region) => {
      let face = kernel.makeFace(pathWire(kernel, region.outer));
      if (region.holes.length > 0) face = kernel.addHolesInFace(face, region.holes.map((hole) => pathWire(kernel, hole)));
      return kernel.extrude(face, 0, height, 0);
    });
    return solids.length === 1 ? solids[0] : kernel.makeCompound(solids);
  }

  for (const builder of MOTIF_BUILDERS) {
    it(`builds ${builder.name}`, () => {
      const layer = buildMotifLayer(builder.id);
      let solid;
      let how = "area";
      if (layer.profile.stroke) {
        solid = buildStrokedSketchSolid(kernel, layer.profile, layer.profile.stroke, layer.height);
        how = "kernel stroke";
        if (!solid) {
          const area = strokedSketchProfile(runtime, layer.profile);
          expect(area, builder.id).not.toBeNull();
          solid = extrudeArea(area!, layer.height);
          how = "manifold stroke";
        }
      } else {
        solid = extrudeArea(layer.profile, layer.height);
      }
      expect(kernel.getVolume(solid), `${builder.id} (${how})`).toBeGreaterThan(1);
      const box = kernel.getBoundingBox(solid, false);
      expect(box.ymax - box.ymin).toBeCloseTo(layer.height, 2);
      expect(Math.max(box.xmax - box.xmin, box.zmax - box.zmin)).toBeLessThan(layer.diameter + 0.5);
      console.log(`${builder.id}: ${how}, ${(box.xmax - box.xmin).toFixed(1)} mm across`);
    });
  }

  it("builds offset layers of a whole bottom layer, a step smaller each time", () => {
    const body = (profile: SketchProfile): WorkplaneShape => ({ id: "b", name: "b", kind: "mesh", color: "#000", x: 0, z: 0, size: 1, width: 1, depth: 1, height: 2.5, rotation: 0, sketchProfile: profile });
    let layer = [body(buildMotifLayer("scallop-disc").profile), body(buildMotifLayer("lotus").profile), body(buildMotifLayer("center").profile)];
    for (const dropOuter of [false, true, false]) {
      const profile = offsetLayerProfile(runtime, layer, { offset: 1, line: 2, dropOuter })!;
      let solid = buildStrokedSketchSolid(kernel, profile, profile.stroke!, 2.5);
      if (!solid) solid = extrudeArea(strokedSketchProfile(runtime, profile)!, 2.5);
      expect(kernel.getVolume(solid)).toBeGreaterThan(1);
      layer = [body(profile)];
    }
  });
});
