import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import mandala from "@/lib/lessons/mandala";
import { LESSONS, sectionPages } from "@/lib/lessons";
import { isLessonId, LESSON_OPTIONS } from "@/lib/lessons/catalog";
import { buildMotifLayer, cleanMotifParams, MOTIF_BUILDERS, motifBuilder, motifDefaults } from "@/lib/lessons/mandalaMotifs";
import { mandalaCentreOf, mandalaPlaceOn } from "@/lib/lessons/mandalaPlace";
import { inches } from "@/lib/lessons/sceneChecks";
import type { LessonStep } from "@/lib/lessons/types";
import { orderedCadSketchPaths } from "@/lib/sketchCadProfile";
import { strokedSketchProfile } from "@/lib/sketchStroke";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * Layered Mandala: the shape builders draw sketches the sketch tool can build, and the lesson's
 * checks read a stack of rings the way a student builds it.
 */

let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

describe("mandala shape builders", () => {
  it("draws every copy as an outline of its own round the middle", () => {
    for (const builder of MOTIF_BUILDERS) {
      const layer = buildMotifLayer(builder.id);
      const paths = orderedCadSketchPaths(layer.profile);
      const expected = builder.single ? 1 : builder.defaults.count;
      expect(paths, builder.id).toHaveLength(expected);
      // Rays are open lines; everything else is closed.
      expect(paths.every((path) => path.closed === (builder.id !== "rays")), builder.id).toBe(true);
      expect(layer.height).toBeCloseTo(builder.defaults.height * 25.4, 5);
      expect(layer.diameter, builder.id).toBeGreaterThan(inches(0.5));
      expect(layer.diameter, builder.id).toBeLessThan(inches(5));
    }
  });

  it("keeps point and segment ids unique", () => {
    const layer = buildMotifLayer("lotus", { count: 24 });
    expect(new Set(layer.profile.points.map((point) => point.id)).size).toBe(layer.profile.points.length);
    expect(new Set(layer.profile.segments.map((segment) => segment.id)).size).toBe(layer.profile.segments.length);
  });

  it("strokes a ring with a line width and fills it without", () => {
    expect(buildMotifLayer("lotus", { line: 1.5 }).profile.stroke).toMatchObject({ width: 1.5, align: "center" });
    expect(buildMotifLayer("lotus", { line: 0 }).profile.stroke).toBeUndefined();
    // Criss-cross rings need the line: without it the overlaps would melt together.
    expect(buildMotifLayer("crisscross-circles", { line: 0 }).profile.stroke?.width).toBeGreaterThan(0);
    expect(buildMotifLayer("rays").profile.stroke).toMatchObject({ cap: "round" });
    expect(buildMotifLayer("lotus").profile.stroke?.join).toBe("round");
    expect(buildMotifLayer("diamond", { line: 1 }).profile.stroke?.join).toBe("miter");
  });

  it("builds a criss-cross lattice as one connected stroke", () => {
    const layer = buildMotifLayer("crisscross-circles", { count: 12 });
    const stroked = strokedSketchProfile(runtime, layer.profile);
    expect(stroked).not.toBeNull();
    // The circles cross, so their lines join into one piece with many openings in it.
    const loops = orderedCadSketchPaths(stroked!).filter((path) => path.closed);
    expect(loops.length).toBeGreaterThan(12);
  });

  it("turns the ring and keeps the motifs on their circle", () => {
    const straight = buildMotifLayer("diamond", { count: 4, turn: 0 });
    const turned = buildMotifLayer("diamond", { count: 4, turn: 45 });
    const first = (layer: typeof straight) => layer.profile.points[0];
    expect(first(straight).z).toBeCloseTo(0, 3);
    expect(Math.hypot(first(turned).x, first(turned).z)).toBeCloseTo(Math.hypot(first(straight).x, first(straight).z), 3);
    expect(first(turned).z).not.toBeCloseTo(0, 1);
  });

  it("cleans what a student types", () => {
    const lotus = motifBuilder("lotus")!;
    const cleaned = cleanMotifParams(lotus, { count: 500, length: -4, height: Number.NaN, turn: -90 });
    expect(cleaned.count).toBe(72);
    expect(cleaned.length).toBeGreaterThan(0);
    expect(cleaned.height).toBeCloseTo(motifDefaults(lotus).height, 5);
    expect(cleaned.turn).toBe(270);
    expect(cleanMotifParams(motifBuilder("star")!, { count: 1 }).count).toBe(3);
  });
});

/* ---------- the lesson's checks ---------- */

let nextId = 0;
/** A ring from a builder as the editor holds it: a sketch body standing on its middle. */
function ring(diameter: number, height: number, bottom: number, extra: Partial<WorkplaneShape> = {}): WorkplaneShape {
  nextId += 1;
  const size = inches(diameter);
  return {
    id: `r${nextId}`,
    name: `Ring ${nextId}`,
    kind: "mesh",
    color: "#cccccc",
    x: 0,
    z: 0,
    elevation: inches(bottom),
    size,
    width: size,
    depth: size,
    height: inches(height),
    rotation: 0,
    sketchProfile: { points: [{ id: "a", x: -size / 2, z: -size / 2 }, { id: "b", x: size / 2, z: size / 2 }], segments: [], stroke: { width: 1.5, align: "center", join: "miter", cap: "flat" } },
    ...extra,
  };
}

const steps = (sectionId: string, chosen: string[] = []) => {
  const section = mandala.sections.find((entry) => entry.id === sectionId)!;
  return sectionPages(section, chosen).flatMap((page) => (page.kind === "step" ? [page.step] : []));
};
const step = (sectionId: string, id: string, chosen: string[] = []): LessonStep => steps(sectionId, chosen).find((entry) => entry.id === id)!;
const run = (target: LessonStep, shapes: WorkplaneShape[], projectName = "Mandala_Maya") => target.check!({ shapes, projectName });

describe("Layered Mandala lesson", () => {
  it("is offered to LayerLab tutorials", () => {
    expect(LESSONS.mandala).toBe(mandala);
    expect(isLessonId("mandala")).toBe(true);
    expect(LESSON_OPTIONS.some((entry) => entry.id === "mandala")).toBe(true);
    expect(mandala.library).toBe("mandala");
  });

  it("gives every step a unique id", () => {
    const ids = mandala.sections.flatMap((section) => [
      ...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? []),
    ].map((entry) => entry.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("asks for the design's name", () => {
    const name = step("welcome", "mandala-name");
    expect(run(name, [], "Untitled design 1").ok).toBe(false);
    expect(run(name, [], "Mandala_Maya").ok).toBe(true);
  });

  it("checks the base's size", () => {
    const base = step("base", "mandala-base");
    expect(run(base, []).ok).toBe(false);
    expect(run(base, [ring(2, 0.12, 0)]).message).toMatch(/at least 3 in/);
    expect(run(base, [ring(4.2, 0.12, 0)]).ok).toBe(true);
  });

  it("wants each ring on the one below, in the middle", () => {
    const petals = step("petals", "mandala-petals-lotus", ["lotus"]);
    const base = ring(4.2, 0.12, 0);
    expect(run(petals, [base]).ok).toBe(false);
    expect(run(petals, [base, ring(3.8, 0.1, 0.12)]).ok).toBe(true);
    // Off the middle: it slid when it was moved.
    const slid = run(petals, [base, ring(3.8, 0.1, 0.12, { x: inches(0.5) })]);
    expect(slid.ok).toBe(false);
    expect(slid.message).toMatch(/off the middle/);
    // Floating above the base is not stacked.
    expect(run(petals, [base, ring(3.8, 0.1, 0.5)]).ok).toBe(false);
  });

  it("wants the criss-cross ring built with a stroke", () => {
    const criss = step("criss-cross", "mandala-criss-circles", ["circles"]);
    const base = ring(4.2, 0.12, 0);
    const petals = ring(3.8, 0.1, 0.12);
    expect(run(criss, [base, petals, ring(3.2, 0.1, 0.22)]).ok).toBe(true);
    const filled = ring(3.2, 0.1, 0.22);
    filled.sketchProfile = { ...filled.sketchProfile!, stroke: undefined };
    expect(run(criss, [base, petals, filled]).message).toMatch(/stroke/);
  });

  it("finishes with a centre button on top", () => {
    const centre = step("centre", "mandala-centre");
    const stackOf = [ring(4.2, 0.12, 0), ring(3.8, 0.1, 0.12), ring(3.2, 0.1, 0.22), ring(3.6, 0.08, 0.12)];
    expect(run(centre, [...stackOf, ring(0.8, 0.12, 0.32)]).ok).toBe(true);
    expect(run(centre, [...stackOf, ring(2.4, 0.12, 0.32)]).message).toMatch(/top piece/);
  });
});

describe("where a new ring goes", () => {
  it("stands on the plate's middle with nothing selected", () => {
    expect(mandalaPlaceOn([], null)).toEqual({ x: 0, z: 0, elevation: 0 });
  });

  it("goes on top of the selection, on its sketch's middle", () => {
    // Five petals are not centred in their box: the body stands 3 mm off the sketch's middle.
    const petals = ring(3, 0.1, 0.12, { x: 13, z: -4, sketchProfile: { points: [{ id: "a", x: -10, z: -10 }, { id: "b", x: 16, z: 10 }], segments: [] } });
    const box = { minX: 0, maxX: 26, minY: inches(0.12), maxY: inches(0.22), minZ: -14, maxZ: 6 };
    expect(mandalaCentreOf(petals, box)).toEqual({ x: 10, z: -4 });
    expect(mandalaPlaceOn([petals], box)).toEqual({ x: 10, z: -4, elevation: Math.round(inches(0.22) * 1000) / 1000 });
  });
});
