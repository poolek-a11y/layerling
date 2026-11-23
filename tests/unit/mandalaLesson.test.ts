import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import mandala from "@/lib/lessons/mandala";
import mandalaCross from "@/lib/lessons/mandalaCross";
import { offsetLayerProfile } from "@/lib/lessons/mandalaOffset";
import { LESSONS, sectionPages } from "@/lib/lessons";
import { isLessonId, LESSON_OPTIONS } from "@/lib/lessons/catalog";
import { buildMotifLayer, cleanMotifParams, MOTIF_BUILDERS, motifBuilder, motifDefaults } from "@/lib/lessons/mandalaMotifs";
import { mandalaCentreOf, mandalaPlaceOn } from "@/lib/lessons/mandalaPlace";
import { inches } from "@/lib/lessons/sceneChecks";
import type { Lesson, LessonStep } from "@/lib/lessons/types";
import { orderedCadSketchPaths } from "@/lib/sketchCadProfile";
import { strokedSketchProfile } from "@/lib/sketchStroke";
import type { SketchProfile, WorkplaneShape } from "@/types/layerling";

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

const lessonSteps = (lesson: Lesson, sectionId: string, chosen: string[] = []) => {
  const section = lesson.sections.find((entry) => entry.id === sectionId)!;
  return sectionPages(section, chosen).flatMap((page) => (page.kind === "step" ? [page.step] : []));
};
const step = (lesson: Lesson, sectionId: string, id: string, chosen: string[] = []): LessonStep => lessonSteps(lesson, sectionId, chosen).find((entry) => entry.id === id)!;
const run = (target: LessonStep, shapes: WorkplaneShape[], projectName = "Mandala_Maya") => target.check!({ shapes, projectName });

/** A finished bottom layer: outline, petals and centre circle on the plate. */
const bottom = () => [ring(4.2, 0.1, 0), ring(3.9, 0.1, 0), ring(1.1, 0.1, 0)];

describe.each([
  { lesson: mandala, prefix: "Mandala", name: "mandala", choice: "lotus", base: "mandala-base", petals: "mandala-petals-lotus", circle: "mandala-centre-circle" },
  { lesson: mandalaCross, prefix: "Cross", name: "cross", choice: "round", base: "cross-outline-round", petals: "cross-petals", circle: "cross-centre-circle" },
])("$lesson.title lesson", ({ lesson, prefix, name, choice, base, petals, circle }) => {
  it("is offered to LayerLab tutorials", () => {
    expect(LESSONS[lesson.id]).toBe(lesson);
    expect(isLessonId(lesson.id)).toBe(true);
    expect(LESSON_OPTIONS.some((entry) => entry.id === lesson.id)).toBe(true);
    expect(lesson.library).toBe("mandala");
  });

  it("builds five layers", () => {
    expect(lesson.sections.map((section) => section.id).filter((id) => id.startsWith("layer-"))).toEqual(["layer-1", "layer-2", "layer-3", "layer-4", "layer-5"]);
  });

  it("gives every step a unique id", () => {
    const ids = lesson.sections.flatMap((section) => [
      ...(section.steps ?? []), ...(section.choices ?? []).flatMap((entry) => entry.steps), ...(section.after ?? []),
    ].map((entry) => entry.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("asks for the design's name", () => {
    const naming = step(lesson, "welcome", `${name}-name`);
    expect(run(naming, [], "Untitled design 1").ok).toBe(false);
    expect(run(naming, [], `${prefix}_Maya`).ok).toBe(true);
  });

  it("builds the bottom layer from pieces level with each other", () => {
    const outline = step(lesson, "layer-1", base, [choice]);
    expect(run(outline, []).ok).toBe(false);
    expect(run(outline, [ring(2, 0.1, 0)]).message).toMatch(/at least 3 in/);
    expect(run(outline, [ring(4.2, 0.1, 0)]).ok).toBe(true);
    const inside = step(lesson, "layer-1", petals, [choice]);
    expect(run(inside, [ring(4.2, 0.1, 0)]).ok).toBe(false);
    // On top instead of level: not part of the bottom layer.
    expect(run(inside, [ring(4.2, 0.1, 0), ring(3.9, 0.1, 0.1)]).ok).toBe(false);
    expect(run(inside, [ring(4.2, 0.1, 0), ring(3.9, 0.1, 0)]).ok).toBe(true);
    expect(run(step(lesson, "layer-1", circle, [choice]), bottom()).ok).toBe(true);
  });

  it("stacks offset layers drawn as strokes, in the middle", () => {
    const two = step(lesson, "layer-2", `${name}-layer2`);
    expect(run(two, bottom()).ok).toBe(false);
    expect(run(two, [...bottom(), ring(4.1, 0.1, 0.1)]).ok).toBe(true);
    const slid = run(two, [...bottom(), ring(4.1, 0.1, 0.1, { x: inches(0.5) })]);
    expect(slid.message).toMatch(/off the middle/);
    const solid = ring(4.1, 0.1, 0.1);
    solid.sketchProfile = { ...solid.sketchProfile!, stroke: undefined };
    expect(run(two, [...bottom(), solid]).message).toMatch(/stroke/);
    // Floating above layer 1 is not stacked.
    expect(run(two, [...bottom(), ring(4.1, 0.1, 0.5)]).ok).toBe(false);
  });

  it("finishes with a centre on layer 5", () => {
    const centre = step(lesson, "layer-5", `${name}-layer5`);
    const four = [...bottom(), ring(4.1, 0.1, 0.1), ring(3.6, 0.1, 0.2), ring(3.4, 0.1, 0.3)];
    expect(run(centre, four).ok).toBe(false);
    expect(run(centre, [...four, ring(1, 0.1, 0.4)]).ok).toBe(true);
    expect(run(centre, [...four, ring(3, 0.1, 0.4)]).message).toMatch(/centre is/);
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

describe("cross builders", () => {
  it("draws one closed outline with an arm per count", () => {
    for (const id of ["cross-round", "cross-pointed"]) {
      for (const count of [4, 6]) {
        const paths = orderedCadSketchPaths(buildMotifLayer(id, { count }).profile);
        expect(paths).toHaveLength(1);
        expect(paths[0].closed).toBe(true);
      }
    }
  });

  it("makes the bottom arm longer for a Latin cross", () => {
    const zs = (long: number) => buildMotifLayer("cross-pointed", { long, length: 50, width: 20 }).profile.points.map((point) => point.z);
    expect(Math.max(...zs(0))).toBeCloseTo(50, 3);
    expect(Math.max(...zs(25))).toBeCloseTo(75, 3);
    expect(Math.min(...zs(25))).toBeCloseTo(-50, 3);
  });
});

describe("offset layer", () => {
  /** A layer as the editor holds it: the builder's sketch, standing with its middle at (x, z). */
  const placed = (builderId: string, x = 0, z = 0): WorkplaneShape => ({ ...ring(1, 0.1, 0), x, z, sketchProfile: buildMotifLayer(builderId).profile });
  const loops = (profile: SketchProfile) => orderedCadSketchPaths(profile).filter((path) => path.closed).length;

  it("sets every outline in by the offset and strokes it with the line", () => {
    const profile = offsetLayerProfile(runtime, [placed("ring")], { offset: 1, line: 2, dropOuter: false })!;
    expect(profile.stroke).toMatchObject({ width: 2, align: "center" });
    const reach = Math.max(...profile.points.map((point) => Math.hypot(point.x, point.z)));
    expect(reach).toBeCloseTo(1.8 * 25.4 - 1, 0);
  });

  it("follows the layer where it stands", () => {
    const profile = offsetLayerProfile(runtime, [placed("ring", 30, -10)], { offset: 1, line: 2, dropOuter: false })!;
    const xs = profile.points.map((point) => point.x);
    const zs = profile.points.map((point) => point.z);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(30, 0);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(-10, 0);
  });

  it("leaves out the outermost outline, a whole ring of petals at once", () => {
    const layer = [placed("scallop-disc"), placed("lotus"), placed("center")];
    const all = offsetLayerProfile(runtime, layer, { offset: 0.5, line: 2, dropOuter: false })!;
    const stepped = offsetLayerProfile(runtime, layer, { offset: 0.5, line: 2, dropOuter: true })!;
    expect(loops(all)).toBe(1 + 10 + 1);
    expect(loops(stepped)).toBe(10 + 1);
    const twice = offsetLayerProfile(runtime, [{ ...ring(1, 0.1, 0), sketchProfile: stepped }], { offset: 0.5, line: 2, dropOuter: true })!;
    expect(loops(twice)).toBe(1);
  });

  it("is null for a body without a sketch", () => {
    expect(offsetLayerProfile(runtime, [{ ...ring(1, 0.1, 0), sketchProfile: undefined }], { offset: 1, line: 2, dropOuter: false })).toBeNull();
  });
});
