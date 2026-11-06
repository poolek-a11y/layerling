import { describe, expect, it } from "vitest";
import kokeshi from "@/lib/lessons/kokeshi";
import { sectionAchieved, sectionPages, skillsUsed } from "@/lib/lessons";
import { allParts, floatingObjects, inches } from "@/lib/lessons/sceneChecks";
import { toMetric } from "@/lib/lessons/units";
import { isLessonId, lessonLink } from "@/lib/lessons/catalog";
import type { LessonStep } from "@/lib/lessons/types";
import type { ShapeKind, WorkplaneShape } from "@/types/layerling";

/*
 * Kokeshi Maker's checks, run on doll-shaped scenes built by hand: a check must pass on the part
 * it asks for and say what is missing when it is not there.
 */

let nextId = 0;
function shape(kind: ShapeKind, size: { w: number; h: number; d?: number }, at: { x?: number; z?: number; y?: number } = {}, extra: Partial<WorkplaneShape> = {}): WorkplaneShape {
  nextId += 1;
  return {
    id: `s${nextId}`,
    name: `${kind} ${nextId}`,
    kind,
    color: "#cccccc",
    x: at.x ?? 0,
    z: at.z ?? 0,
    elevation: at.y ?? 0,
    size: inches(size.w),
    width: inches(size.w),
    depth: inches(size.d ?? size.w),
    height: inches(size.h),
    rotation: 0,
    ...extra,
  };
}

/** Groups the shapes the way the editor does: the parts kept in the group's own frame, centred on it. */
function group(children: WorkplaneShape[], operation: WorkplaneShape["groupOperation"] = "group"): WorkplaneShape {
  const boxes = allParts({ shapes: children }).map((part) => part.box);
  const minX = Math.min(...boxes.map((box) => box.minX));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  const minZ = Math.min(...boxes.map((box) => box.minZ));
  const maxZ = Math.max(...boxes.map((box) => box.maxZ));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  nextId += 1;
  return {
    id: `g${nextId}`,
    name: "Group",
    kind: "mesh",
    color: children[0].color,
    x: cx,
    z: cz,
    elevation: minY,
    width: maxX - minX,
    depth: maxZ - minZ,
    size: Math.max(maxX - minX, maxZ - minZ),
    height: maxY - minY,
    rotation: 0,
    groupedBaseWidth: maxX - minX,
    groupedBaseDepth: maxZ - minZ,
    groupedBaseHeight: maxY - minY,
    groupOperation: operation,
    groupedShapes: children.map((child) => ({ ...child, x: child.x - cx, z: child.z - cz, elevation: (child.elevation ?? 0) - minY })),
  };
}

const body = () => shape("cylinder", { w: 2.5, h: 4 });
const head = (y = 3.875, w = 2.625, x = 0) => shape("sphere", { w, h: w }, { x, y: inches(y) });
const hair = (head: WorkplaneShape, extra: Partial<WorkplaneShape> = {}) => shape("halfSphere", { w: 2.875, h: 2.25 }, { y: (head.elevation ?? 0) + inches(0.5) }, extra);

function step(id: string): LessonStep {
  for (const section of kokeshi.sections) {
    const steps = [...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? [])];
    const found = steps.find((entry) => entry.id === id);
    if (found) return found;
  }
  throw new Error(`no step ${id}`);
}

const run = (id: string, shapes: WorkplaneShape[], projectName?: string) => step(id).check!({ shapes, projectName });

describe("Kokeshi Maker lesson", () => {
  it("walks from the welcome through freestyle with unique step ids", () => {
    expect(kokeshi.sections.map((section) => section.id)).toEqual(["welcome", "body", "head", "hair", "kimono", "armor", "face", "accessories", "print", "freestyle"]);
    const ids = kokeshi.sections.flatMap((section) => [...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? [])].map((entry) => entry.id));
    // The bob's 7 steps are shared by three hair choices; every other id is its own.
    expect(new Set(ids).size).toBe(ids.length - 14);
  });

  it("asks for the design to be named Kokeshi_name", () => {
    expect(run("name", [], "Untitled design").ok).toBe(false);
    expect(run("name", [], "Kokeshi_").ok).toBe(false);
    expect(run("name", [], "Kokeshi_Maya").ok).toBe(true);
  });

  it("offers a cylinder, a flat-bottomed sphere and a cone for the body", () => {
    const section = kokeshi.sections.find((entry) => entry.id === "body")!;
    expect(section.choices!.map((choice) => choice.id)).toEqual(["cylinder", "sphere", "cone"]);
  });

  it("checks the body's size and says how to fix it in fractions", () => {
    expect(run("body-cylinder-place", []).ok).toBe(false);
    expect(run("body-cylinder-place", [body()]).ok).toBe(true);
    expect(run("body-cylinder-size", [body()]).ok).toBe(true);
    const short = run("body-cylinder-size", [shape("cylinder", { w: 2.5, h: 2 })]);
    expect(short.ok).toBe(false);
    expect(short.message).toMatch(/2 in tall.*4 in.*bigger.*Keep proportions/);
    expect(run("body-measure", [shape("cylinder", { w: 2.5, h: 5.25 })]).message).toMatch(/5 1\/4 in tall.*smaller/);
  });

  it("cuts the sphere body flat with a grouped hole", () => {
    const egg = shape("sphere", { w: 3, h: 4.5 });
    const cutter = shape("box", { w: 4, h: 0.5 }, {}, { hole: true });
    expect(run("body-sphere-place", [egg]).ok).toBe(true);
    expect(run("body-sphere-cut", [egg, cutter]).ok).toBe(true);
    expect(run("body-sphere-group", [egg, cutter]).ok).toBe(false);
    const grouped = group([egg, cutter]);
    expect(run("body-sphere-group", [grouped]).message).toMatch(/Drop/);
    expect(run("body-sphere-group", [{ ...grouped, elevation: -inches(0.5) }]).ok).toBe(true);
  });

  it("aligns the head before sizing it, then sinks it 1/8 in and groups it", () => {
    const small = shape("sphere", { w: 0.8, h: 0.8 }, { x: inches(4) });
    expect(run("head-place", [body(), small]).ok).toBe(true);
    expect(run("head-align", [body(), small]).message).toMatch(/Centre/);
    expect(run("head-align", [body(), shape("sphere", { w: 0.8, h: 0.8 })]).message).toMatch(/Lift/);
    expect(run("head-align", [body(), shape("sphere", { w: 0.8, h: 0.8 }, { y: inches(4) })]).ok).toBe(true);
    expect(run("head-size", [body(), shape("sphere", { w: 0.8, h: 0.8 }, { y: inches(4) })]).message).toMatch(/51\/64 in across.*2 5\/8 in.*bigger/);
    expect(run("head-size", [body(), head()]).ok).toBe(true);
    expect(run("head-size", [body(), shape("sphere", { w: 2.625, h: 3.25 }, { y: inches(3.875) })]).message).toMatch(/no longer round/);
    expect(run("head-sink", [body(), head()]).ok).toBe(true);
    expect(run("head-sink", [body(), head(4.25)]).message).toMatch(/above the body/);
    expect(run("head-sink", [body(), head(3.5)]).message).toMatch(/Raise/);
    expect(run("head-group", [body(), head()]).ok).toBe(false);
    expect(run("head-group", [group([body(), head()])]).ok).toBe(true);
  });

  it("builds a bob from a bigger copy of the head, hollowed with a head-sized hole", () => {
    const theHead = head();
    const copy = (w: number, extra: Partial<WorkplaneShape> = {}) => shape("sphere", { w, h: w }, { y: inches(3.875 - (w - 2.625) / 2) }, extra);
    expect(run("bob-place", [body(), theHead, copy(2.875)]).ok).toBe(true);
    expect(run("bob-place", [body(), theHead, copy(3.5)]).message).toMatch(/about 1\/4 in bigger/);
    expect(run("bob-lengthen", [body(), theHead, copy(2.875)]).ok).toBe(false);
    const long = shape("sphere", { w: 2.875, h: 3.35 }, { y: inches(3.275) });
    expect(run("bob-lengthen", [body(), theHead, long]).ok).toBe(true);
    const bangs = shape("box", { w: 1.875, h: 1.375, d: 1.25 }, { z: inches(1.3), y: inches(4.3) }, { hole: true });
    const behind = { ...bangs, id: "behind", z: -inches(1.3) };
    expect(run("bob-bangs", [body(), theHead, long, behind]).ok).toBe(false);
    expect(run("bob-bangs", [body(), theHead, long, bangs]).ok).toBe(true);
    expect(run("bob-hollow", [body(), theHead, long]).ok).toBe(false);
    const scoop = shape("sphere", { w: 2.625, h: 2.625 }, { y: inches(3.875) }, { hole: true });
    expect(run("bob-hollow", [body(), theHead, long, scoop]).ok).toBe(true);
    expect(run("bob-group", [body(), theHead, group([long, bangs, scoop])]).ok).toBe(true);
    expect(run("bob-group", [group([body(), theHead, long, bangs, scoop])]).message).toMatch(/only the hair/);
  });

  it("checks pigtails are mirror images", () => {
    const theHead = head();
    const left = shape("ellipse", { w: 0.75, h: 1.375 }, { x: -inches(1.6), y: inches(4.4) });
    const right = shape("ellipse", { w: 0.75, h: 1.375 }, { x: inches(1.6), y: inches(4.4) });
    const crooked = shape("ellipse", { w: 0.75, h: 1.375 }, { x: inches(1.3), y: inches(4.4) });
    expect(run("pigtail-mirror", [body(), theHead, hair(theHead), left, right]).ok).toBe(true);
    expect(run("pigtail-mirror", [body(), theHead, hair(theHead), left, crooked]).ok).toBe(false);
  });

  it("reads grouped parts where the group puts them, moved or stretched", () => {
    const doll = group([body(), head()]);
    const moved = { ...doll, x: doll.x + inches(3) };
    const parts = allParts({ shapes: [moved] });
    expect(parts.every((part) => Math.abs(part.cx - inches(3)) < 0.01)).toBe(true);
    const taller = { ...doll, height: doll.height * 2 };
    const top = Math.max(...allParts({ shapes: [taller] }).map((part) => part.box.maxY));
    expect(top).toBeCloseTo(doll.height * 2, 3);
  });

  it("finds the obi and floating parts", () => {
    const obi = shape("tube", { w: 2.75, h: 0.5 }, { y: inches(1.8) });
    expect(run("obi", [body(), head(), obi]).ok).toBe(true);
    expect(run("obi", [body(), head()]).ok).toBe(false);
    const flower = shape("sphere", { w: 0.5, h: 0.5 }, { x: inches(5), y: inches(2) });
    expect(floatingObjects({ shapes: [body(), head(), flower] }).map((part) => part.shape.id)).toEqual([flower.id]);
    expect(run("print-floating", [body(), head(), flower]).ok).toBe(false);
  });

  it("checks accessory steps for the part itself, not only that the doll prints", () => {
    const leaf = shape("cylinder", { w: 2, h: 0.0625 }, { x: inches(5) });
    const rib = (i: number) => shape("box", { w: 0.0625, h: 1, d: 0.0625 }, { x: inches(5), z: i });
    expect(run("fan-ribs", [body(), leaf, rib(0)]).ok).toBe(false);
    expect(run("fan-ribs", [body(), leaf, ...[0, 1, 2, 3, 4].map(rib)]).ok).toBe(true);
    expect(run("fan-hold", [body(), leaf]).ok).toBe(false);
    const pin = shape("cylinder", { w: 0.125, h: 1.5 }, { x: inches(5) });
    const bead = shape("sphere", { w: 0.25, h: 0.25 }, { x: inches(5), y: inches(1.5) });
    expect(run("ornament-pin", [body(), pin, bead]).message).toMatch(/Group/);
    expect(run("ornament-pin", [body(), group([pin, bead])]).ok).toBe(true);
  });

  it("checks the finished doll's height, colours and bundle", () => {
    const parts = () => [body(), head(), shape("halfSphere", { w: 2.875, h: 2.25 }, { y: inches(4.4) }, { color: "#111111" })];
    expect(run("print-size", [group(parts())]).ok).toBe(true);
    expect(run("print-size", [body()]).message).toMatch(/4 in tall.*Scale by percent at about 175 %/);
    expect(run("print-colours", parts()).ok).toBe(true);
    expect(run("print-colours", [body(), head()]).ok).toBe(false);
    expect(run("print-bundle", [group(parts(), "bundle")]).ok).toBe(true);
    expect(run("print-bundle", [group(parts())]).message).toMatch(/Bundle/);
    expect(run("print-bundle", parts()).message).toMatch(/3 separate objects/);
  });

  it("shows each section's menu first, then the chosen steps", () => {
    const hairSection = kokeshi.sections.find((section) => section.id === "hair")!;
    expect(sectionPages(hairSection, []).map((page) => page.kind)).toEqual(["menu"]);
    const bun = sectionPages(hairSection, ["bun"]);
    expect(bun.map((page) => (page.kind === "step" ? page.step.id : "menu"))).toEqual(["menu", "bob-place", "bob-lengthen", "bob-bangs", "bob-feather", "bob-hollow", "bob-fit", "bob-group", "bun"]);
    const kimono = kokeshi.sections.find((section) => section.id === "kimono")!;
    expect(sectionPages(kimono, ["sash"]).map((page) => (page.kind === "step" ? page.step.id : "menu"))).toEqual(["menu", "obi", "sash-cord", "sash-bow", "raised-engraved"]);
  });

  it("cheers a section only when every check in it passed", () => {
    const head = kokeshi.sections.find((section) => section.id === "head")!;
    const all = ["head-place", "head-align", "head-size", "head-sink", "head-group"];
    expect(sectionAchieved(head, [], all)).toBe(true);
    expect(sectionAchieved(head, [], all.slice(0, 4))).toBe(false);
    const welcome = kokeshi.sections.find((section) => section.id === "welcome")!;
    expect(sectionAchieved(welcome, [], ["meet", "why", "plan", "look", "undo"])).toBe(false);
    expect(sectionAchieved(welcome, [], ["meet", "why", "plan", "name", "look", "undo"])).toBe(true);
  });

  it("lists only skills from steps whose check passed", () => {
    const done = ["meet", "body-cylinder-place", "body-cylinder-size", "head-align", "bob-bangs", "face-workplane"];
    expect(skillsUsed(kokeshi, done).map((entry) => entry.skill)).toEqual(["Place a shape", "Resize by typing", "Align", "Hole"]);
  });

  it("puts the orange outline where the head goes, on top of the body", () => {
    const ghost = step("head-align").ghost!({ shapes: [body()] })!;
    expect(ghost[0].kind).toBe("sphere");
    expect(ghost[0].y).toBeCloseTo(inches(3.875), 3);
    expect(ghost[0].w).toBeCloseTo(inches(2.625), 3);
  });

  it("shows sizes in millimetres for a student working in metric", () => {
    expect(toMetric("Make it about 2 5/8 in across.")).toBe("Make it about 67 mm across.");
    expect(toMetric("about 3/4 x 3/4 x 1 3/8 in")).toBe("about 19 x 19 x 35 mm");
    expect(toMetric("It should be 6 to 8 in tall.")).toBe("It should be 152 to 203 mm tall.");
  });

  it("links LayerLab tutorials to the lesson", () => {
    expect(isLessonId("kokeshi")).toBe(true);
    expect(isLessonId("nope")).toBe(false);
    expect(lessonLink("/?layerlab=new", "kokeshi")).toBe("/?layerlab=new&lesson=kokeshi");
  });
});
