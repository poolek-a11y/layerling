import { describe, expect, it } from "vitest";
import kokeshi from "@/lib/lessons/kokeshi";
import { newProgress, sectionPages, skillsUsed } from "@/lib/lessons";
import { floatingObjects, inches } from "@/lib/lessons/sceneChecks";
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

const group = (children: WorkplaneShape[]): WorkplaneShape => ({ ...shape("box", { w: 3, h: 7 }), groupedShapes: children });

const body = () => shape("cylinder", { w: 2.5, h: 4 });
const head = (y = 3.85) => shape("sphere", { w: 2.5, h: 2.5 }, { y: inches(y) });

function step(id: string): LessonStep {
  for (const section of kokeshi.sections) {
    const steps = [...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? [])];
    const found = steps.find((entry) => entry.id === id);
    if (found) return found;
  }
  throw new Error(`no step ${id}`);
}

const run = (id: string, shapes: WorkplaneShape[]) => step(id).check!({ shapes });

describe("Kokeshi Maker lesson", () => {
  it("walks from the welcome through freestyle with unique step ids", () => {
    expect(kokeshi.sections.map((section) => section.id)).toEqual(["welcome", "body", "head", "hair", "kimono", "armor", "face", "accessories", "print", "freestyle"]);
    const ids = kokeshi.sections.flatMap((section) => [...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? [])].map((entry) => entry.id));
    // The bob steps are shared by three hair choices; every other id is its own.
    expect(new Set(ids).size).toBe(ids.length - 6);
  });

  it("checks the body's place and size", () => {
    expect(run("body-place", []).ok).toBe(false);
    expect(run("body-place", [body()]).ok).toBe(true);
    expect(run("body-size", [body()]).ok).toBe(true);
    expect(run("body-size", [shape("cylinder", { w: 2.5, h: 2 })]).ok).toBe(false);
  });

  it("checks the head is centred, sunk in a little and grouped", () => {
    expect(run("head-align", [body(), head()]).ok).toBe(true);
    expect(run("head-align", [body(), head(4.2)]).message).toMatch(/Lower the head/);
    expect(run("head-align", [body(), head(3.2)]).message).toMatch(/too deep/);
    expect(run("head-align", [body(), shape("sphere", { w: 2.5, h: 2.5 }, { x: 10, y: inches(3.85) })]).message).toMatch(/Centre/);
    expect(run("head-group", [body(), head()]).ok).toBe(false);
    expect(run("head-group", [group([body(), head()])]).ok).toBe(true);
  });

  it("checks pigtails are mirror images", () => {
    const hair = shape("halfSphere", { w: 2.75, h: 1.4 }, { y: inches(5) });
    const left = shape("ellipse", { w: 0.8, h: 1.4 }, { x: -inches(1.5), y: inches(4.3) });
    const right = shape("ellipse", { w: 0.8, h: 1.4 }, { x: inches(1.5), y: inches(4.3) });
    const crooked = shape("ellipse", { w: 0.8, h: 1.4 }, { x: inches(1.2), y: inches(4.3) });
    expect(run("pigtail-mirror", [body(), head(), hair, left, right]).ok).toBe(true);
    expect(run("pigtail-mirror", [body(), head(), hair, left, crooked]).ok).toBe(false);
  });

  it("finds the obi and floating parts", () => {
    const obi = shape("tube", { w: 2.75, h: 0.5 }, { y: inches(1.8) });
    expect(run("obi", [body(), head(), obi]).ok).toBe(true);
    expect(run("obi", [body(), head()]).ok).toBe(false);
    const flower = shape("sphere", { w: 0.5, h: 0.5 }, { x: inches(5), y: inches(2) });
    expect(floatingObjects({ shapes: [body(), head(), flower] }).map((part) => part.shape.id)).toEqual([flower.id]);
    expect(run("print-floating", [body(), head(), flower]).ok).toBe(false);
  });

  it("checks the finished doll's height and that it is one object", () => {
    const doll = group([body(), head(), shape("halfSphere", { w: 2.75, h: 1.4 }, { y: inches(5) })]);
    expect(run("print-size", [doll]).ok).toBe(true);
    expect(run("print-group", [doll]).ok).toBe(true);
    expect(run("print-group", [body(), head()]).ok).toBe(false);
    expect(run("print-size", [body()]).ok).toBe(false);
  });

  it("puts the menu and the chosen steps in order", () => {
    const hair = kokeshi.sections.find((section) => section.id === "hair")!;
    expect(sectionPages(hair, []).map((page) => page.kind)).toEqual(["menu"]);
    const bun = sectionPages(hair, ["bun"]);
    expect(bun.map((page) => (page.kind === "step" ? page.step.id : "menu"))).toEqual(["menu", "bob-dome", "bob-fringe", "bob-group", "bun"]);
  });

  it("lists the skills a student has used", () => {
    const progress = { ...newProgress("kokeshi"), done: ["body-place", "body-size", "head-align", "bob-fringe"] };
    expect(skillsUsed(kokeshi, progress.done).map((entry) => entry.skill)).toEqual(["Place a shape", "Resize by typing", "Align", "Hole"]);
  });

  it("links LayerLab tutorials to the lesson", () => {
    expect(isLessonId("kokeshi")).toBe(true);
    expect(isLessonId("nope")).toBe(false);
    expect(lessonLink("/?layerlab=new", "kokeshi")).toBe("/?layerlab=new&lesson=kokeshi");
  });
});
