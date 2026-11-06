import { describe, expect, it } from "vitest";
import nutcracker, { isMetallicColour, jointProblem } from "@/lib/lessons/nutcracker";
import { LESSONS, sectionPages } from "@/lib/lessons";
import { allParts, inches, solids } from "@/lib/lessons/sceneChecks";
import { toDecimalInches, toMetric } from "@/lib/lessons/units";
import { isLessonId } from "@/lib/lessons/catalog";
import type { LessonStep } from "@/lib/lessons/types";
import type { ShapeKind, WorkplaneShape } from "@/types/layerling";

/*
 * Nutcracker's checks, run on nutcracker-shaped scenes built by hand the way a student would build
 * the guided one: base, boots, legs, body, the four peg joints, head, face and hat.
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

const cyl = (w: number, h: number, x: number, y: number, extra: Partial<WorkplaneShape> = {}) => shape("cylinder", { w, h }, { x: inches(x), y: inches(y) }, extra);

/** Two legs (boot, leg, top peg and the boot's hole for the base peg) grouped into one piece each. */
function legPiece(side: -1 | 1, { holeW = 9 / 32 } = {}) {
  const x = 0.5 * side;
  return group([
    cyl(0.875, 1.25, x, 0.5),
    cyl(0.75, 1.625, x, 1.625),
    cyl(0.25, 0.5625, x, 3.1875),
    cyl(holeW, 0.625, x, 0.40625, { hole: true }),
  ]);
}
const basePiece = () => group([cyl(4, 0.5, 0, 0), cyl(0.25, 0.5625, -0.5, 0.4375), cyl(0.25, 0.5625, 0.5, 0.4375)]);
const bodyPiece = (holeW = 9 / 32) => group([cyl(2.25, 2.75, 0, 3.25), cyl(holeW, 0.625, -0.5, 3.15625, { hole: true }), cyl(holeW, 0.625, 0.5, 3.15625, { hole: true })]);
const head = () => cyl(1.625, 2.25, 0, 5.875, { color: "#f1c27d" });
const hat = () => cyl(1.75, 1.75, 0, 7.875, { color: "#111111" });
const assembled = (holeW = 9 / 32) => [basePiece(), legPiece(-1), legPiece(1), bodyPiece(holeW), head()];

function step(id: string): LessonStep {
  for (const section of nutcracker.sections) {
    const steps = [...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? [])];
    const found = steps.find((entry) => entry.id === id);
    if (found) return found;
  }
  throw new Error(`no step ${id}`);
}

const run = (id: string, shapes: WorkplaneShape[], projectName?: string) => step(id).check!({ shapes, projectName });

describe("Nutcracker lesson", () => {
  it("is offered next to Kokeshi Maker and has unique step ids", () => {
    expect(isLessonId("nutcracker")).toBe(true);
    expect(LESSONS.nutcracker).toBe(nutcracker);
    expect(nutcracker.sections.map((section) => section.id)).toEqual(["welcome", "base", "legs", "body", "joints", "head", "face", "hair", "hat", "arms", "uniform", "accessory", "print", "freestyle"]);
    const ids = nutcracker.sections.flatMap((section) => [...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? [])].map((entry) => entry.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("asks for the design to be named Nutcracker_name", () => {
    expect(run("name", [], "Untitled design").ok).toBe(false);
    expect(run("name", [], "Nutcracker_").ok).toBe(false);
    expect(run("name", [], "nutcracker_Maya").ok).toBe(true);
    expect(run("name", [], "Nutcracker _Maya").ok).toBe(true);
  });

  it("checks the base's size and says how to fix it", () => {
    expect(run("base-round", [cyl(4, 0.5, 0, 0)]).ok).toBe(true);
    expect(run("base-round", [cyl(2.5, 0.5, 0, 0)]).message).toMatch(/2 1\/2 in wide.*4 in.*bigger/);
    expect(run("base-measure", [cyl(4, 1.5, 0, 0)]).ok).toBe(false);
  });

  it("finds a boot left on the workplane and says to lift it onto the base", () => {
    const base = cyl(4, 0.5, 0, 0);
    expect(run("boot-shaft", [base, cyl(0.875, 1.25, -0.5, 0.5)]).ok).toBe(true);
    expect(run("boot-shaft", [base, cyl(0.875, 1.25, 3, 0)]).message).toMatch(/Lift the boot onto the base/);
  });

  it("builds a leg on its boot, groups it, and mirrors it", () => {
    const base = cyl(4, 0.5, 0, 0);
    const boot = cyl(0.875, 1.25, -0.5, 0.5);
    const leg = cyl(0.75, 1.625, -0.5, 1.625);
    expect(run("leg-place", [base, boot, leg]).ok).toBe(true);
    expect(run("leg-place", [base, boot, cyl(0.75, 1, -0.5, 1.625)]).message).toMatch(/top of your leg is 2 5\/8 in up/);
    expect(run("leg-group", [base, boot, leg]).ok).toBe(false);
    expect(run("leg-group", [base, group([boot, leg])]).ok).toBe(true);
    expect(run("leg-mirror", [base, group([boot, leg])]).ok).toBe(false);
    expect(run("leg-mirror", [base, legPiece(-1), legPiece(1)]).ok).toBe(true);
  });

  it("stands the body on the legs without grouping it to them", () => {
    const shapes = [basePiece(), legPiece(-1), legPiece(1)];
    expect(run("body-lift", [...shapes, cyl(2.25, 2.75, 0, 3.25)]).ok).toBe(true);
    expect(run("body-lift", [...shapes, cyl(2.25, 2.75, 0, 0)]).message).toMatch(/bottom of the body is 0 in up.*3 1\/4 in/);
  });

  it("checks every peg joint for a hole 1/32 in bigger in the right piece", () => {
    expect(run("joint-leg-pegs", assembled()).ok).toBe(true);
    expect(run("joint-body-holes", assembled()).ok).toBe(true);
    expect(run("joint-base", assembled()).ok).toBe(true);
    expect(run("print-joints", assembled()).ok).toBe(true);
    const tight = run("joint-body-holes", assembled(0.25));
    expect(tight.ok).toBe(false);
    expect(tight.message).toMatch(/too tight.*1\/32 in wider/);
    expect(run("joint-body-holes", assembled(0.375)).message).toMatch(/wobble/);
    // The pegs not grouped with their legs.
    const loosePeg = [basePiece(), group([cyl(0.875, 1.25, -0.5, 0.5), cyl(0.75, 1.625, -0.5, 1.625)]), cyl(0.25, 0.5625, -0.5, 3.1875), legPiece(1), bodyPiece()];
    expect(run("joint-leg-pegs", loosePeg).message).toMatch(/Group/);
    // A hole left ungrouped cuts nothing.
    const ungrouped = [basePiece(), legPiece(-1), legPiece(1), cyl(2.25, 2.75, 0, 3.25), cyl(9 / 32, 0.625, -0.5, 3.15625, { hole: true }), cyl(9 / 32, 0.625, 0.5, 3.15625, { hole: true })];
    expect(run("joint-body-holes", ungrouped).message).toMatch(/Group the hole/);
  });

  it("says when a hole is too shallow", () => {
    const shallow = group([cyl(2.25, 2.75, 0, 3.25), cyl(9 / 32, 0.25, -0.5, 3.25, { hole: true }), cyl(9 / 32, 0.25, 0.5, 3.25, { hole: true })]);
    const peg = allParts({ shapes: [legPiece(-1)] }).find((part) => part.kind === "cylinder" && part.w < inches(0.3) && !part.hole)!;
    expect(jointProblem({ shapes: [basePiece(), legPiece(-1), legPiece(1), shallow] }, peg, "here")?.message).toMatch(/not as deep/);
  });

  it("puts the head on the body, sunk 1/8 in", () => {
    expect(run("head-place", [...assembled().slice(0, 4), cyl(1.625, 2.25, 4, 0)]).ok).toBe(true);
    expect(run("head-place", [...assembled().slice(0, 4), cyl(1.625, 1.5, 4, 0)]).message).toMatch(/1 1\/2 in tall.*2 1\/4 in.*bigger/);
    expect(run("head-align", assembled()).ok).toBe(true);
    expect(run("head-align", [...assembled().slice(0, 4), cyl(1.625, 2.25, 0, 6.5)]).message).toMatch(/above the body/);
  });

  it("checks the teeth are a row of matching parts in the mouth", () => {
    const tooth = (i: number) => shape("box", { w: 3 / 32, h: 1 / 8, d: 1 / 16 }, { x: inches(-0.3 + i / 8), z: inches(0.84), y: inches(6.2) });
    expect(run("face-teeth", [...assembled(), tooth(0)]).ok).toBe(false);
    expect(run("face-teeth", [...assembled(), ...[0, 1, 2, 3, 4, 5].map(tooth)]).ok).toBe(true);
    expect(run("face-measure", [...assembled(), ...[0, 1, 2, 3, 4, 5].map(tooth)]).ok).toBe(true);
  });

  it("finds the hat over the head", () => {
    expect(run("hat-tall", [...assembled(), hat()]).ok).toBe(true);
    expect(run("hat-tall", [...assembled(), cyl(1.75, 1.75, 0.3, 7.875)]).message).toMatch(/Align/);
  });

  it("measures 8 to 10 in, and allows up to 12 in because it prints in pieces", () => {
    expect(run("print-size", [...assembled(), hat()]).ok).toBe(true);
    expect(run("print-size", [...assembled(), cyl(1.75, 3.5, 0, 7.875)]).message).toMatch(/fine because it prints in pieces/);
    expect(run("print-size", assembled().slice(0, 3)).message).toMatch(/Scale by percent/);
  });

  it("asks for a metallic colour in the paint plan", () => {
    expect(isMetallicColour("#d4af37")).toBe(true);
    expect(isMetallicColour("#c0c0c0")).toBe(true);
    expect(isMetallicColour("#ff0000")).toBe(false);
    expect(isMetallicColour("#111111")).toBe(false);
    // The shapes' own starting colours (orange cylinder, yellow ellipse, grey) are not metallic.
    expect(["#d97813", "#e0a324", "#f5c518", "#8a96a3", "#9aa4ae", "#c0703a"].some(isMetallicColour)).toBe(false);
    const paint = (shape: WorkplaneShape, color: string): WorkplaneShape => ({ ...shape, color, groupedShapes: shape.groupedShapes?.map((child) => paint(child, color)) });
    const painted = [paint(basePiece(), "#ffffff"), paint(legPiece(-1), "#111111"), paint(legPiece(1), "#111111"), paint(bodyPiece(), "#d41721"), head(), hat()];
    expect(run("print-metallic", painted).message).toMatch(/gold/);
    expect(run("print-metallic", [...painted, cyl(2.375, 0.25, 0, 4.5, { color: "#D4AF37" })]).ok).toBe(true);
  });

  it("checks the pieces are laid out apart and flat for printing", () => {
    expect(run("print-layout", [...assembled(), hat()]).message).toMatch(/touch/);
    const top = group([cyl(2.25, 2.75, 0, 0), cyl(1.625, 2.25, 0, 2.625)], "bundle");
    const laidOut = [cyl(4, 0.5, 0, 0), { ...legPiece(-1), x: inches(4), elevation: -inches(3 / 32) }, { ...legPiece(1), x: inches(6), elevation: -inches(3 / 32) }, { ...top, x: inches(-4) }];
    const result = run("print-layout", laidOut);
    expect(result.ok).toBe(true);
    expect(run("print-layout", [...laidOut.slice(0, 3), { ...top, x: inches(-4), elevation: inches(1) }]).message).toMatch(/Drop to workplane/);
    expect(solids({ shapes: laidOut }).length).toBeGreaterThan(4);
  });

  it("shows the hat menu first, with one set of steps per choice", () => {
    const section = nutcracker.sections.find((entry) => entry.id === "hat")!;
    expect(sectionPages(section, []).map((page) => page.kind)).toEqual(["menu"]);
    expect(sectionPages(section, ["crown"]).map((page) => (page.kind === "step" ? page.step.id : "menu"))).toEqual(["menu", "crown-band", "crown-points", "crown-jewels"]);
  });

  it("reads joint sizes in decimal inches and millimetres", () => {
    expect(toDecimalInches("9/32 in across and 5/8 in tall")).toBe("0.28 in across and 0.63 in tall");
    expect(toMetric("a peg 1/4 in across, a hole 9/32 in across")).toBe("a peg 6.5 mm across, a hole 7 mm across");
  });
});
