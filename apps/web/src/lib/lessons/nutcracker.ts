import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import {
  between,
  connectedAndPrintable,
  fail,
  floatingObjects,
  formatInches,
  holes,
  inches,
  mirroredPair,
  pass,
  solids,
  thinParts,
  topObjects,
  touches,
  type Part,
} from "@/lib/lessons/sceneChecks";
import type { CheckResult, FigurePart, GhostPart, Lesson, LessonChoice, LessonScene, LessonStep, StepCheck } from "@/lib/lessons/types";

/*
 * Nutcracker: the lesson content, built like Kokeshi Maker. Sizes in the text are inches in
 * fractions (the panel shows them as decimals or millimetres); the checks compare in millimetres,
 * as the editor stores them, and accept a range so every student's nutcracker can differ.
 * Students build every part from basic shapes. Front is +z, as the view cube's FRONT.
 *
 * The nutcracker prints in pieces: the base, each leg (with its boot), the top (body, head, face,
 * hair and hat) and the optional arms. Pegs join them: a peg on one piece slides into a hole in
 * the next, the hole 1/32 in wider and 1/32 in deeper than the peg so the printed parts fit.
 * It is built standing together, so every check can see how the parts meet; the last steps lay
 * the pieces out on the plate for printing.
 */

/* ---------- sizes (inches) ---------- */

const BASE_W = 4;
const BASE_H = 0.5;
const FOOT_X = 0.5;
const LEG_W = 0.75;
const LEG_TOP = 3.25;
const BODY_W = 2.25;
const BODY_H = 2.75;
const HEAD_W = 1.625;
const HEAD_H = 2.25;
const SINK = 0.125;
const HEAD_Y = LEG_TOP + BODY_H - SINK;
const HEAD_TOP = HEAD_Y + HEAD_H;
const PEG_W = 0.25;
const PEG_L = 0.5625;
const ARM_W = 0.625;
const ARM_L = 2.5;
const ARM_X = BODY_W / 2 + ARM_W / 2;

/* ---------- the front-view pictures (inches) ---------- */

const done = (part: FigurePart): FigurePart => ({ ...part, state: "done" });
const added = (part: FigurePart): FigurePart => ({ ...part, state: "new" });
const hole = (part: FigurePart): FigurePart => ({ ...part, state: "hole" });
const both = (part: FigurePart): FigurePart[] => [part, { ...part, x: -part.x, tilt: part.tilt ? -part.tilt : undefined }];

const BASE: FigurePart = { shape: "rect", x: 0, y: 0, w: BASE_W, h: BASE_H };
const BOOT: FigurePart = { shape: "rect", x: -FOOT_X, y: BASE_H, w: 0.875, h: 1.25 };
const TOE: FigurePart = { shape: "ellipse", x: -FOOT_X, y: BASE_H, w: 0.875, h: 0.5 };
const LEG: FigurePart = { shape: "rect", x: -FOOT_X, y: 1.625, w: LEG_W, h: LEG_TOP - 1.625 };
const BODY: FigurePart = { shape: "rect", x: 0, y: LEG_TOP, w: BODY_W, h: BODY_H };
const HEAD: FigurePart = { shape: "rect", x: 0, y: HEAD_Y, w: HEAD_W, h: HEAD_H };
const HAT: FigurePart = { shape: "rect", x: 0, y: HEAD_TOP - 0.25, w: 1.75, h: 1.75 };
const BRIM: FigurePart = { shape: "rect", x: 0, y: HEAD_TOP - 0.25, w: 2.125, h: 0.125 };
const ARM: FigurePart = { shape: "rect", x: -ARM_X, y: LEG_TOP + 0.25, w: ARM_W, h: ARM_L };
const HAND: FigurePart = { shape: "ellipse", x: -ARM_X, y: LEG_TOP, w: 0.625, h: 0.625 };
const LEG_PEG: FigurePart = { shape: "rect", x: -FOOT_X, y: LEG_TOP - 0.0625, w: PEG_W, h: PEG_L };
const BASE_PEG: FigurePart = { shape: "rect", x: -FOOT_X, y: BASE_H - 0.0625, w: PEG_W, h: PEG_L };
const EYE: FigurePart = { shape: "ellipse", x: -0.35, y: HEAD_Y + 1.5, w: 0.25, h: 0.25 };
const NOSE: FigurePart = { shape: "tri", x: 0, y: HEAD_Y + 1.05, w: 0.3, h: 0.4 };
const MUSTACHE: FigurePart = { shape: "ellipse", x: -0.3, y: HEAD_Y + 0.85, w: 0.6, h: 0.2, tilt: -12 };
const MOUTH: FigurePart = { shape: "rect", x: 0, y: HEAD_Y + 0.2, w: 0.75, h: 0.55 };
const teeth = (y: number) => [-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((x) => added({ shape: "rect", x, y, w: 0.09, h: 0.125 }));

const STANDING = [done(BASE), ...both(done(BOOT)), ...both(done(LEG))];
const TOP = [...STANDING, done(BODY), done(HEAD)];
const FACE = [...TOP, ...both(done(EYE)), done(NOSE), ...both(done(MUSTACHE))];
const FINISHED = [...FACE, done(HAT), done(BRIM), ...both(done(ARM)), ...both(done(HAND))];

/* ---------- finding the parts ---------- */

const PROPORTION_TIP = "To change the size without changing the shape, turn on Keep proportions in the shape's card (or hold Shift while you drag a corner handle), or use Scale by percent.";

const volume = (part: Part) => part.w * part.h * part.d;
const tilted = (part: Part) => Math.abs(part.shape.rotationX ?? 0) > 0.5 || Math.abs(part.shape.rotationZ ?? 0) > 0.5;
/** Across a round part (its own width or length, whichever is smaller), whatever way it is turned. */
const across = (part: Part) => Math.min(shapeWidth(part.shape), shapeDepth(part.shape));
/** A part's own sizes, smallest first (not its box, which a turn changes). */
const ownSizes = (part: Part) => [shapeWidth(part.shape), part.shape.height, shapeDepth(part.shape)].sort((a, b) => a - b);
const centred = (a: Part, b: Part, slack = 0.8) => Math.abs(a.cx - b.cx) <= slack && Math.abs(a.cz - b.cz) <= slack;

/** The stand: the widest flat part on the workplane. */
function findBase(scene: LessonScene) {
  return solids(scene)
    .filter((part) => part.box.minY < 1.5 && part.h <= inches(1.25) && part.w >= inches(2) && part.d >= inches(1.5))
    .sort((a, b) => b.w * b.d - a.w * a.d)[0] ?? null;
}

/** Shoes and boots: parts standing on top of the base, about foot-sized. */
function findFeet(scene: LessonScene) {
  const base = findBase(scene);
  if (!base) return [];
  return solids(scene).filter((part) => part !== base && !tilted(part)
    && Math.abs(part.box.minY - base.box.maxY) <= inches(0.15)
    && between(part.w, inches(0.5), inches(1.5)) && between(part.d, inches(0.5), inches(2.25)) && between(part.h, inches(0.25), inches(2.25)));
}

/** Legs: upright posts standing on the feet. */
function findLegs(scene: LessonScene) {
  const base = findBase(scene);
  const floor = base ? base.box.maxY : 0;
  return solids(scene).filter((part) => !tilted(part)
    && part.box.minY >= floor + inches(0.2) && part.box.minY <= inches(2.5)
    && between(part.h, inches(1), inches(3.5)) && between(part.w, inches(0.4), inches(1.15)) && between(part.d, inches(0.4), inches(1.15)))
    .sort((a, b) => a.cx - b.cx);
}

/** The body (the jacket): the biggest tall part. */
function findBody(scene: LessonScene) {
  return solids(scene).filter((part) => !tilted(part) && part.h >= inches(2) && between(part.w, inches(1.5), inches(3.25)) && part.d >= inches(1.25))
    .sort((a, b) => volume(b) - volume(a))[0] ?? null;
}

const headSized = (part: Part) => !tilted(part) && between(part.w, inches(1.25), inches(2.6)) && between(part.h, inches(1), inches(3));

/** The head: the biggest head-sized part sitting on the body. */
function findHead(scene: LessonScene) {
  const body = findBody(scene);
  if (!body) return null;
  return solids(scene).filter((part) => part !== body && headSized(part)
    && part.box.minY > body.box.maxY - inches(0.6) && part.box.minY < body.box.maxY + inches(0.5))
    .sort((a, b) => volume(b) - volume(a))[0] ?? null;
}

/** Before it is lifted onto the body: the biggest head-sized part that isn't the body or base. */
function anyHead(scene: LessonScene) {
  const body = findBody(scene);
  const base = findBase(scene);
  return solids(scene).filter((part) => part !== body && part !== base && headSized(part)).sort((a, b) => volume(b) - volume(a))[0] ?? null;
}

/** The head covering: the widest part over the top of the head. */
function findHat(scene: LessonScene) {
  const head = findHead(scene);
  if (!head) return null;
  return solids(scene).filter((part) => part !== head && touches(part, head, 1) && part.cy > head.cy
    && part.box.maxY > head.box.maxY + inches(0.125) && part.w >= head.w * 0.85)
    .sort((a, b) => b.w - a.w)[0] ?? null;
}

/** Arms: long parts hanging at the sides of the body, touching it. */
function findArms(scene: LessonScene) {
  const body = findBody(scene);
  if (!body) return [];
  return solids(scene).filter((part) => {
    const sizes = ownSizes(part);
    return part !== body && Math.abs(part.cx - body.cx) > body.w / 2 && sizes[2] >= inches(1.5) && sizes[1] <= inches(1.1)
      && touches(part, body, 1.5) && part.cy > body.box.minY;
  });
}

/** Pegs: short round posts, about 1/4 in across. */
function findPegs(scene: LessonScene) {
  return solids(scene).filter((part) => part.kind === "cylinder" && between(across(part), inches(0.15), inches(0.5)) && between(part.shape.height, inches(0.3), inches(0.875)));
}

/** Small parts on the head: the face. */
function onHead(scene: LessonScene, head: Part, longest = 1) {
  return solids(scene).filter((part) => part !== head && Math.max(...ownSizes(part)) < inches(longest) && touches(part, head, 1));
}

/* ---------- small check builders ---------- */

function sizeAdvice(what: string, measured: number, low: number, high: number, target: string, dimension: "tall" | "wide" | "long" | "across") {
  if (between(measured, inches(low), inches(high))) return null;
  const direction = measured < inches(low) ? "bigger" : "smaller";
  return fail(`Your ${what} is ${formatInches(measured)} ${dimension}. Aim for ${target}: make it ${direction}. ${PROPORTION_TIP}`);
}

type Then<T extends unknown[]> = (...args: [...T, LessonScene]) => CheckResult;

const needBase = (then: Then<[Part]>): StepCheck => (scene) => {
  const base = findBase(scene)
    ?? solids(scene).filter((part) => part.box.minY < 1.5).sort((a, b) => b.w * b.d - a.w * a.d)[0];
  return base ? then(base, scene) : fail("Start with the base: drag a shape onto the workplane.");
};

const needLegs = (then: Then<[[Part, Part], Part]>): StepCheck => needBase((base, scene) => {
  const pair = mirroredPair(findLegs(scene), base.cx, 1.5);
  return pair ? then([pair[0], pair[1]], base, scene) : fail("Build both legs first, standing on their boots, as mirror images.");
});

const needBody = (then: Then<[Part]>): StepCheck => (scene) => {
  const body = findBody(scene);
  return body ? then(body, scene) : fail("Build the body first: a part at least 2 in tall and 1 1/2 in wide.");
};

const needHead = (then: Then<[Part, Part]>): StepCheck => needBody((body, scene) => {
  const head = findHead(scene);
  return head ? then(head, body, scene) : fail("Put the head on top of the body first.");
});

const needHat = (then: Then<[Part, Part]>): StepCheck => needHead((head, _body, scene) => {
  const hat = findHat(scene);
  return hat ? then(hat, head, scene) : fail("Put the hat over the top of the head first: about as wide as the head and higher than it.");
});

const printable: StepCheck = (scene) => connectedAndPrintable(scene, "nutcracker");

/** Every part touches the nutcracker (or, for accessories, says which one is loose). */
const accessoryTouches = (what: string): StepCheck => (scene) => {
  const floating = floatingObjects(scene);
  if (floating.length) return fail(`${floating.length === 1 ? "A part" : `${floating.length} parts`} of the ${what} ${floating.length === 1 ? "is" : "are"} not touching the nutcracker. Move ${floating.length === 1 ? "it" : "them"} until ${floating.length === 1 ? "it touches" : "they touch"}.`);
  return printable(scene);
};

/** How many of `parts` share one size: what Pattern or Duplicate makes. */
function sameSizeCount(parts: Part[]) {
  const bySize = new Map<string, number>();
  for (const part of parts) {
    const key = ownSizes(part).map((value) => Math.round(value * 2)).join("x");
    bySize.set(key, (bySize.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...bySize.values());
}

/* ---------- peg joints ---------- */

const CLEARANCE_MIN = inches(0.012);
const CLEARANCE_MAX = inches(1 / 16);

/** The hole a peg slides into: a round hole on the peg's line, overlapping it. */
function holeFor(scene: LessonScene, peg: Part) {
  const onLine = (a: Part, b: Part) => [Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy), Math.abs(a.cz - b.cz)].filter((gap) => gap <= 1).length >= 2;
  return holes(scene)
    .filter((cut) => cut.kind === "cylinder" && touches(cut, peg, 0) && onLine(cut, peg))
    .sort((a, b) => Math.hypot(a.cx - peg.cx, a.cy - peg.cy, a.cz - peg.cz) - Math.hypot(b.cx - peg.cx, b.cy - peg.cy, b.cz - peg.cz))[0] ?? null;
}

/** What is wrong with a peg's joint, or null when it will fit together after printing. */
export function jointProblem(scene: LessonScene, peg: Part, where: string): CheckResult | null {
  const socket = holeFor(scene, peg);
  if (!socket) return fail(`The peg ${where} has no hole yet. Duplicate the peg, make the copy a Hole, and Align it to the peg's centre.`);
  const gap = across(socket) - across(peg);
  if (gap < CLEARANCE_MIN) return fail(`The hole ${where} is ${formatInches(across(socket))} across and the peg ${formatInches(across(peg))}: too tight to fit once printed. Make the hole 1/32 in wider than the peg (${formatInches(across(peg) + inches(1 / 32))}).`);
  if (gap > CLEARANCE_MAX) return fail(`The hole ${where} is ${formatInches(across(socket))} across and the peg ${formatInches(across(peg))}: so loose it will wobble. Make the hole only 1/32 in wider than the peg (${formatInches(across(peg) + inches(1 / 32))}).`);
  if (socket.topId === peg.topId) return fail(`The hole ${where} is grouped with its own peg. Undo, and group the hole with the piece the peg slides into.`);
  if (!solids(scene).some((part) => part.topId === socket.topId)) return fail(`Group the hole ${where} with the piece the peg slides into, so it cuts a socket there.`);
  if (!tilted(peg) && !tilted(socket) && socket.box.maxY < peg.box.maxY + inches(1 / 32) - 0.15) return fail(`The hole ${where} is not as deep as the peg. Make it 1/16 in longer than the peg, centred on it, so the joint closes all the way.`);
  return null;
}

/** The peg on top of a leg, grouped with it. */
const legPeg = (scene: LessonScene, leg: Part) => findPegs(scene).find((peg) => centred(peg, leg, 1) && peg.box.minY < leg.box.maxY - 0.2 && peg.box.minY > leg.box.maxY - inches(0.3) && peg.box.maxY > leg.box.maxY);

/** The peg on the base under a leg's boot. */
const basePeg = (scene: LessonScene, base: Part, leg: Part) => findPegs(scene).find((peg) => Math.abs(peg.cx - leg.cx) <= inches(0.3) && Math.abs(peg.cz - leg.cz) <= inches(0.5) && peg.box.minY < base.box.maxY && peg.box.maxY > base.box.maxY + inches(0.25));

/** The peg at an arm's shoulder, grouped with it and pointing into the body. */
const armPeg = (scene: LessonScene, arm: Part, body: Part) => findPegs(scene).find((peg) => peg.topId === arm.topId && touches(peg, body, 0));

function allJoints(scene: LessonScene): CheckResult {
  const pegs = findPegs(scene);
  if (pegs.length < 4) return fail(`Your nutcracker has ${pegs.length} peg${pegs.length === 1 ? "" : "s"}. The legs need four: one on top of each leg and one under each boot (see Peg joints).`);
  for (const peg of pegs) {
    const problem = jointProblem(scene, peg, `at ${peg.shape.name}`);
    if (problem) return problem;
  }
  return pass(`All ${pegs.length} joints have room to fit.`);
}

/* ---------- the orange outlines on the build plate (mm) ---------- */

const ghostBase = (kind: GhostPart["kind"], w: number, d: number): GhostPart[] => [{ kind, x: 0, z: 0, y: 0, w: inches(w), d: inches(d), h: inches(BASE_H) }];

const ghostLegs = (scene: LessonScene, make: (x: number, floor: number) => GhostPart[]) => {
  const base = findBase(scene);
  if (!base) return null;
  return [...make(base.cx - inches(FOOT_X), base.box.maxY), ...make(base.cx + inches(FOOT_X), base.box.maxY)];
};

const ghostBody = (scene: LessonScene, kind: GhostPart["kind"] = "cylinder", w = BODY_W, d = BODY_W): GhostPart[] | null => {
  const legs = findLegs(scene);
  const base = findBase(scene);
  const top = legs.length ? Math.max(...legs.map((leg) => leg.box.maxY)) : inches(LEG_TOP);
  return [{ kind, x: base?.cx ?? 0, z: base?.cz ?? 0, y: top, w: inches(w), d: inches(d), h: inches(BODY_H) }];
};

const ghostHead = (scene: LessonScene): GhostPart[] | null => {
  const body = findBody(scene);
  return body ? [{ kind: "cylinder", x: body.cx, z: body.cz, y: body.box.maxY - inches(SINK), w: inches(HEAD_W), d: inches(HEAD_W), h: inches(HEAD_H) }] : null;
};

const onTopOfHead = (scene: LessonScene, make: (head: Part) => GhostPart[]) => {
  const head = findHead(scene);
  return head ? make(head) : null;
};

/* ---------- welcome ---------- */

const welcome: LessonStep[] = [
  {
    id: "meet",
    title: "Meet the nutcracker",
    body: "Nutcracker figures come from the Ore Mountains (Erzgebirge) of Germany, where woodworkers turned toys on lathes. In the 1870s a woodturner named Wilhelm Füchtner began making the soldier-shaped nutcrackers we know today, with a big head, a hinged jaw and a tall hat.\n\nThey were made to look like proud kings, soldiers and police officers. People said a nutcracker guards the house and brings good luck.",
    figure: { parts: FINISHED, caption: "A nutcracker: base, legs, body, head, hat and arms." },
  },
  {
    id: "story",
    title: "The story and the ballet",
    body: "In 1816 E. T. A. Hoffmann wrote a story about a nutcracker that comes to life on Christmas Eve and battles the Mouse King. In 1892 Tchaikovsky turned it into the ballet The Nutcracker, which is why nutcrackers became a holiday decoration.\n\nYour nutcracker's jaw won't crack nuts. Its teeth are for show, and you can make it a soldier, a king, a candy nutcracker or anything you like.",
  },
  {
    id: "plan",
    title: "Your choices",
    body: "You'll build your nutcracker from simple shapes, from the bottom up, choosing as you go:\n\nBase: a round, square or stepped stand.\n\nLegs: boots or shoes, with legs on top.\n\nBody: a straight jacket, a box jacket or a flared coat.\n\nPeg joints: pegs and holes that hold the pieces together.\n\nHead and face: eyes, nose, mustache, and a mouth with teeth.\n\nHair: modelled hair, a beard, a pocket for fur, or grooves for a 3D pen.\n\nHat: a soldier's hat, a helmet or a crown.\n\nArms (optional), uniform details (optional), and an accessory: sword, staff, scepter or ornament.\n\nThen you'll check it, plan its metallic paint, lay out the pieces and print.",
    figure: { parts: FINISHED, caption: "About 10 in tall, built from the bottom up." },
  },
  {
    id: "pieces",
    title: "It prints in pieces",
    body: "Your nutcracker will be 8 to 10 in tall, too tall and too thin to print well in one go. So it prints in pieces: the base, each leg with its boot, the top (body, head and hat), and the arms if you make them.\n\nThe pieces snap together with peg joints: a short peg on one piece slides into a hole in the next. You'll learn how to make the hole just big enough.",
    figure: { parts: [...STANDING, done(BODY), added(LEG_PEG), added({ ...LEG_PEG, x: FOOT_X })], caption: "Pegs on the legs slide into holes in the body." },
  },
  {
    id: "name",
    title: "Name your design",
    body: "Click the design's name at the top of the screen (a new design is called something like \"Untitled design 1\") and rename it Nutcracker_ followed by your name, for example Nutcracker_Maya. Press Enter.",
    check: (scene) => (/^nutcracker\s*_\s*\S+/i.test((scene.projectName ?? "").trim()) ? pass() : fail("Rename the design Nutcracker_ followed by your name, for example Nutcracker_Maya.")),
    success: "Your teacher can find your design by its name.",
    hint: "The name box is in the middle of the top bar. Click it, type the new name, and press Enter.",
  },
  {
    id: "look",
    title: "Look around",
    body: "Right-drag to orbit around the workplane, scroll to zoom, and middle-drag to pan. Try each one now.\n\nThe house button next to the view cube brings the view back to the start whenever you get lost. Ctrl+Z (Cmd+Z on a Mac) undoes a step.\n\nOrange outlines on the workplane show where each new part goes.",
  },
];

/* ---------- base ---------- */

const measureBase: LessonStep = {
  id: "base-measure",
  title: "Measure the base",
  body: "Drag the Ruler onto the workplane at a corner of the base. With the base selected, the ruler shows its width, length and height.\n\nA stable stand is wider than the nutcracker: about 4 in across and 1/2 in tall. If it isn't, click a number on the ruler and type the right one.",
  skill: "Measure",
  figure: { parts: [done(BASE), added({ shape: "line", x: 2.2, y: 0, w: 0, h: BASE_H })], caption: "About 4 in across, 1/2 in tall." },
  check: needBase((base) => sizeAdvice("base", base.w, 3, 5, "about 4 in", "wide") ?? sizeAdvice("base", base.d, 2.5, 5, "at least 2 1/2 in", "long") ?? sizeAdvice("base", base.h, 0.375, 1, "about 1/2 in", "tall") ?? pass()),
  success: "A wide, heavy base keeps a tall nutcracker from tipping over.",
  hint: PROPORTION_TIP,
};

const baseChoices: LessonChoice[] = [
  {
    id: "round",
    label: "Round stand",
    blurb: "A disc, like a peppermint.",
    steps: [{
      id: "base-round",
      title: "Place the disc",
      body: "Drag a Cylinder onto the orange outline in the middle of the workplane. Make it 4 in wide, 4 in long and 1/2 in tall: click each number on the shape and type the size.",
      skill: "Resize by typing",
      figure: { parts: [added(BASE)], caption: "4 in across, 1/2 in tall." },
      ghost: () => ghostBase("cylinder", 4, 4),
      check: needBase((base) => (base.kind === "cylinder" ? sizeAdvice("base", base.w, 3, 5, "4 in", "wide") ?? sizeAdvice("base", base.h, 0.375, 1, "1/2 in", "tall") ?? pass() : fail("Drag a Cylinder onto the workplane for the base."))),
      hint: "In inches you can type fractions: one half can be typed as 1/2 or 0.5.",
    }, measureBase],
  },
  {
    id: "square",
    label: "Square stand",
    blurb: "A block with rounded corners.",
    steps: [{
      id: "base-square",
      title: "Place the block",
      body: "Drag a Rounded Box (or a Box) onto the orange outline. Make it 3 1/2 in wide, 3 in long and 1/2 in tall.",
      skill: "Resize by typing",
      figure: { parts: [added({ ...BASE, w: 3.5 })], caption: "3 1/2 in wide, 1/2 in tall." },
      ghost: () => ghostBase("box", 3.5, 3),
      check: needBase((base) => sizeAdvice("base", base.w, 3, 5, "3 1/2 in", "wide") ?? sizeAdvice("base", base.d, 2.5, 5, "3 in", "long") ?? sizeAdvice("base", base.h, 0.375, 1, "1/2 in", "tall") ?? pass()),
    }, { ...measureBase, id: "base-square-measure" }],
  },
  {
    id: "stepped",
    label: "Stepped stand",
    blurb: "Two layers, like a pedestal.",
    steps: [
      {
        id: "base-step-bottom",
        title: "The bottom layer",
        body: "Drag a Cylinder or a Box onto the orange outline. Make it 4 in wide, 4 in long (3 in for a box) and 1/4 in tall.",
        skill: "Resize by typing",
        figure: { parts: [added({ ...BASE, h: 0.25 })] },
        ghost: () => [{ kind: "cylinder", x: 0, z: 0, y: 0, w: inches(4), d: inches(4), h: inches(0.25) }],
        check: needBase((base) => sizeAdvice("bottom layer", base.w, 3, 5, "4 in", "wide") ?? pass()),
      },
      {
        id: "base-step-top",
        title: "The top layer",
        body: "Duplicate the bottom layer (Ctrl+D). Make the copy 1/2 in smaller each way, lift it 1/4 in so it sits on top, and Align the two centres both ways.",
        skill: "Align",
        figure: { parts: [done({ ...BASE, h: 0.25 }), added({ ...BASE, y: 0.25, w: 3.5, h: 0.25 })] },
        ghost: () => [{ kind: "cylinder", x: 0, z: 0, y: inches(0.25), w: inches(3.5), d: inches(3.5), h: inches(0.25) }],
        check: needBase((base, scene) => {
          const top = solids(scene).find((part) => part !== base && part.w < base.w && part.w >= base.w - inches(1.5) && Math.abs(part.box.minY - base.box.maxY) <= 1 && part.h <= inches(0.75));
          if (!top) return fail("Put a smaller copy of the bottom layer on top of it, its bottom where the bottom layer's top is.");
          return centred(top, base) ? pass() : fail("Select both layers and Align their centres both ways.");
        }),
      },
      {
        id: "base-step-group",
        title: "Group the layers",
        body: "Select both layers and press Group. Now they are one base.",
        skill: "Group",
        check: needBase((base, scene) => (solids(scene).some((part) => part !== base && part.topId === base.topId) ? pass() : fail("Select both layers and press Group."))),
        success: "One stepped base, 1/2 in tall.",
      },
    ],
  },
];

/* ---------- legs and boots ---------- */

/** A boot or shoe that isn't on the base yet (left on the workplane, or floating). */
const strayFoot = (scene: LessonScene, base: Part) => solids(scene).find((part) => part !== base && between(part.w, inches(0.5), inches(1.5)) && between(part.h, inches(0.25), inches(2.25)) && between(part.d, inches(0.5), inches(2.25)));

const needFoot: StepCheck = needBase((base, scene) => {
  if (findFeet(scene).length) return pass();
  const stray = strayFoot(scene, base);
  if (stray) return fail(`Lift the boot onto the base: its bottom is ${formatInches(stray.box.minY)} up and the top of the base is ${formatInches(base.box.maxY)} up. Type ${formatInches(base.box.maxY)} as its height above the workplane.`);
  return fail("Drag the shape onto the orange outline on the base.");
});

const legChoices: LessonChoice[] = [
  {
    id: "boots",
    label: "Tall boots",
    blurb: "Soldier boots with a rounded toe.",
    steps: [
      {
        id: "boot-shaft",
        title: "The boot",
        body: "Drag a Cylinder onto the orange outline on the left of the base. Make it 7/8 in across and 1 1/4 in tall, and lift it so it stands on top of the base (1/2 in up).",
        skill: "Position by typing",
        figure: { parts: [done(BASE), added(BOOT)] },
        ghost: (scene) => ghostLegs(scene, (x, floor) => [{ kind: "cylinder", x, z: 0, y: floor, w: inches(0.875), d: inches(0.875), h: inches(1.25) }])?.slice(0, 1) ?? null,
        check: needFoot,
        hint: "Select the cylinder and type 1/2 in the box that says how high it is above the workplane.",
      },
      {
        id: "boot-toe",
        title: "The toe",
        body: "Stretch a Sphere into a toe, 7/8 in wide, 1 in long and 1/2 in tall. Put it at the bottom of the boot so it sticks out in front, sitting on the base too. Align it with the boot left to right.",
        skill: "Resize on one axis",
        figure: { parts: [done(BASE), done(BOOT), added(TOE)], caption: "The toe pokes out at the front." },
        check: needBase((base, scene) => {
          const feet = findFeet(scene);
          const toe = feet.find((foot) => feet.some((other) => other !== foot && touches(other, foot) && foot.cz > other.cz + inches(0.1)));
          return toe ? pass() : fail("Put the toe against the front of the boot, both standing on the base.");
        }),
        didYouKnow: "A thin Tube around the top of the boot makes a cuff, and small Spheres make buttons.",
      },
    ],
  },
  {
    id: "shoes",
    label: "Shoes",
    blurb: "Low shoes with buckles or bows.",
    steps: [{
      id: "shoe",
      title: "The shoe",
      body: "Drag a Rounded Box onto the orange outline on the left of the base. Make it 7/8 in wide, 1 1/4 in long and 1/2 in tall, and lift it onto the top of the base (1/2 in up).",
      skill: "Position by typing",
      figure: { parts: [done(BASE), added({ ...BOOT, h: 0.5 })] },
      ghost: (scene) => ghostLegs(scene, (x, floor) => [{ kind: "box", x, z: inches(0.2), y: floor, w: inches(0.875), d: inches(1.25), h: inches(0.5) }])?.slice(0, 1) ?? null,
      check: needFoot,
      didYouKnow: "A small flat Box on top makes a buckle, and a Heart makes a bow.",
    }],
  },
];

const legSteps: LessonStep[] = [
  {
    id: "leg-place",
    title: "The leg",
    body: "Drag a Cylinder for the leg. Make it 3/4 in across. Stand it on the boot so its bottom sinks 1/8 in into the boot, and make it tall enough that its top is 3 1/4 in above the workplane.\n\nFor tall boots that is 1 5/8 in tall, 1 5/8 in up. For shoes it is 2 3/8 in tall, 7/8 in up.",
    skill: "Position by typing",
    figure: { parts: [done(BASE), done(BOOT), added(LEG)], caption: "The top of the leg is 3 1/4 in up." },
    check: needBase((_base, scene) => {
      const feet = findFeet(scene);
      if (!feet.length) return fail("Put a boot or shoe on the base first.");
      const leg = findLegs(scene).find((part) => feet.some((foot) => touches(part, foot)));
      if (!leg) return fail("Stand a Cylinder 3/4 in across on top of the boot, sinking a little into it.");
      const foot = feet.find((part) => touches(part, leg))!;
      if (Math.abs(leg.cx - foot.cx) > inches(0.15)) return fail("Select the leg and the boot and Align them left to right.");
      return sizeAdvice("leg", leg.w, 0.5, 1, "3/4 in", "across")
        ?? (between(leg.box.maxY, inches(2.75), inches(3.75)) ? pass() : fail(`The top of your leg is ${formatInches(leg.box.maxY)} up. Aim for 3 1/4 in: change the leg's height.`));
    }),
    hint: "Overlapping parts print as one piece; a gap means the leg falls off its boot.",
    didYouKnow: "Thin Tube rings, Patterned up the leg, make striped stockings.",
  },
  {
    id: "leg-group",
    title: "Group the leg",
    body: "Select the leg and its boot or shoe (and the toe) and press Group. They are one printed piece.",
    skill: "Group",
    check: needBase((_base, scene) => {
      const feet = findFeet(scene);
      const leg = findLegs(scene).find((part) => feet.some((foot) => touches(part, foot)));
      if (!leg) return fail("Build the leg first.");
      return feet.some((foot) => touches(foot, leg) && foot.topId === leg.topId) ? pass() : fail("Select the leg and its boot and press Group.");
    }),
  },
  {
    id: "leg-mirror",
    title: "Mirror the other leg",
    body: "Duplicate the leg (Ctrl+D), use Mirror to flip it left to right, and move it to the other side so the two legs are the same distance from the middle of the base. Leave a little gap between the boots.",
    skill: "Mirror",
    figure: { parts: STANDING, caption: "Two legs, mirror images, the same distance from the middle." },
    ghost: (scene) => ghostLegs(scene, (x, floor) => [{ kind: "cylinder", x, z: 0, y: floor, w: inches(LEG_W), d: inches(LEG_W), h: inches(LEG_TOP) - floor }]),
    check: needLegs(([left, right]) => (left.topId === right.topId ? fail("The two legs are in one group. Undo and keep each leg its own piece, so each one prints by itself.") : touches(left, right, 0) ? fail("Move the legs apart a little so they don't touch.") : pass())),
    success: "Two matching legs. Mirror guarantees they match exactly.",
  },
];

/* ---------- body ---------- */

const bodyChoices: LessonChoice[] = [
  {
    id: "jacket",
    label: "Straight jacket",
    blurb: "A cylinder, the classic soldier.",
    steps: [{
      id: "body-cylinder",
      title: "The jacket",
      body: "Drag a Cylinder onto the workplane. Make it 2 1/4 in wide, 2 1/4 in long and 2 3/4 in tall.",
      skill: "Resize by typing",
      figure: { parts: [...STANDING, added(BODY)] },
      check: needBody((body) => sizeAdvice("body", body.w, 1.75, 2.75, "2 1/4 in", "wide") ?? sizeAdvice("body", body.h, 2.25, 3.5, "2 3/4 in", "tall") ?? pass()),
      hint: "It's fine if it lands beside the legs. The next step lifts it.",
    }],
  },
  {
    id: "box",
    label: "Box jacket",
    blurb: "A rounded block, square and sturdy.",
    steps: [{
      id: "body-box",
      title: "The jacket",
      body: "Drag a Rounded Box onto the workplane. Make it 2 1/4 in wide, 1 3/4 in long and 2 3/4 in tall.",
      skill: "Resize by typing",
      figure: { parts: [...STANDING, added(BODY)] },
      check: needBody((body) => sizeAdvice("body", body.w, 1.75, 2.75, "2 1/4 in", "wide") ?? sizeAdvice("body", body.h, 2.25, 3.5, "2 3/4 in", "tall") ?? pass()),
    }],
  },
  {
    id: "coat",
    label: "Flared coat",
    blurb: "Wider at the bottom, like a long coat.",
    steps: [{
      id: "body-coat",
      title: "The coat",
      body: "Drag a Cone onto the workplane. Make it 2 1/2 in wide and long and 2 3/4 in tall. In its card, make the top about 1 3/4 in across, wide enough to hold the head.",
      skill: "Resize by typing",
      figure: { parts: [...STANDING, added({ shape: "taper", x: 0, y: LEG_TOP, w: 2.5, h: BODY_H, topW: 1.75 })], caption: "2 1/2 in at the bottom, 1 3/4 in at the top." },
      check: needBody((body) => sizeAdvice("coat", body.w, 2, 3, "2 1/2 in", "wide") ?? sizeAdvice("coat", body.h, 2.25, 3.5, "2 3/4 in", "tall") ?? pass()),
      hint: "A cone with a sharp point leaves nothing for the head to sit on. Give it a flat top in its card.",
    }],
  },
];

const bodyAfter: LessonStep[] = [{
  id: "body-lift",
  title: "Stand it on the legs",
  body: "Select the body and the base and Align their centres both ways. Then lift the body until its bottom is on the tops of the legs, 3 1/4 in up.\n\nDon't group the body with the legs: they are separate pieces. Next you'll make the pegs that join them.",
  skill: "Align",
  figure: { parts: [...STANDING, added(BODY)], caption: "The body rests on the tops of the legs." },
  ghost: (scene) => ghostBody(scene),
  check: needLegs(([left, right], base, scene) => {
    const body = findBody(scene);
    if (!body) return fail("Build the body first.");
    if (!centred(body, base, 1.5)) return fail("Select the body and the base and Align their centres both ways.");
    const top = Math.max(left.box.maxY, right.box.maxY);
    if (Math.abs(body.box.minY - top) > inches(0.07)) return fail(`The bottom of the body is ${formatInches(body.box.minY)} up and the legs end ${formatInches(top)} up. Type ${formatInches(top)} as the body's height above the workplane.`);
    if (body.topId === left.topId || body.topId === right.topId) return fail("The body is grouped with a leg. Undo: they are separate pieces.");
    return pass();
  }),
  success: "The body stands on the legs. Peg joints will hold them together.",
}];

/* ---------- peg joints ---------- */

const jointSteps: LessonStep[] = [
  {
    id: "joint-leg-pegs",
    title: "A peg on each leg",
    body: "Drag a Cylinder and make it a peg: 1/4 in across and 9/16 in tall. Select it and a leg and Align their centres both ways. Then lift the peg so 1/16 in of it is inside the top of the leg and 1/2 in sticks up into the body: type its height above the workplane as the top of the leg minus 1/16 in (3 3/16 in).\n\nSelect the peg and its leg and press Group. Do the same on the other leg.",
    skill: "Peg-and-hole joint",
    figure: { parts: [...STANDING, done(BODY), ...both(added(LEG_PEG))], caption: "Each peg sticks 1/2 in up into the body." },
    ghost: (scene) => findLegs(scene).map((leg) => ({ kind: "cylinder" as const, x: leg.cx, z: leg.cz, y: leg.box.maxY - inches(1 / 16), w: inches(PEG_W), d: inches(PEG_W), h: inches(PEG_L) })),
    check: needLegs((legs, base, scene) => {
      for (const leg of legs) {
        const side = leg.cx < base.cx ? "left" : "right";
        const peg = legPeg(scene, leg);
        if (!peg) return fail(`Put a peg 1/4 in across on top of the ${side} leg, centred on it, with 1/16 in of it inside the leg.`);
        if (peg.topId !== leg.topId) return fail(`Select the peg and the ${side} leg and press Group, so the peg is part of the leg.`);
      }
      return pass();
    }),
    hint: "Hold Shift and click both shapes to select them, then press Align (or L).",
  },
  {
    id: "joint-body-holes",
    title: "Holes in the body",
    body: "A printer squeezes plastic out a little wider than the line it draws, so a hole the same size as its peg is too tight to fit. Leave a gap, called clearance.\n\nSelect a peg and press Ctrl+D. Make the copy a Hole, then make it 9/32 in across (1/32 in wider than the peg) and 5/8 in tall (1/16 in longer). Align it to the peg's centre every way. Do the same for the other peg.\n\nThen select the body and both holes and press Group, so the holes cut sockets in the bottom of the body.",
    skill: "Clearance",
    figure: { parts: [...STANDING, done(BODY), ...both(done(LEG_PEG)), ...both(hole({ ...LEG_PEG, w: 0.28125, y: LEG_TOP - 0.09375, h: 0.625 }))], caption: "Grey holes 1/32 in bigger than the pegs." },
    check: needLegs((legs, base, scene) => {
      const body = findBody(scene);
      if (!body) return fail("Stand the body on the legs first.");
      for (const leg of legs) {
        const side = leg.cx < base.cx ? "left" : "right";
        const peg = legPeg(scene, leg);
        if (!peg) return fail(`The ${side} leg has no peg. Go back one step.`);
        const problem = jointProblem(scene, peg, `on the ${side} leg`);
        if (problem) return problem;
        if (holeFor(scene, peg)!.topId !== body.topId) return fail(`Group the ${side} leg's hole with the body.`);
      }
      return pass();
    }),
    didYouKnow: "1/32 in is about 0.8 mm: about 0.4 mm of space all the way round the peg. If your class printer makes joints too loose or too tight, change only the hole.",
    success: "The holes are 1/32 in bigger than the pegs, so the legs will slide into the printed body.",
  },
  {
    id: "joint-base",
    title: "Same again for the base",
    body: "Now join the boots to the base the same way, the other way up. Make a peg 1/4 in across and 9/16 in tall under the middle of each boot: 1/16 in inside the base, 1/2 in sticking up into the boot (type 7/16 in as its height above the workplane). Group both pegs with the base.\n\nDuplicate each peg, make the copy a Hole 9/32 in across and 5/8 in tall, Align it to its peg, and group it with that leg.",
    skill: "Peg-and-hole joint",
    figure: { parts: [done(BASE), ...both(added(BASE_PEG)), ...both(done(BOOT)), ...both(done(LEG))], caption: "Pegs on the base slide up into the boots." },
    ghost: (scene) => {
      const base = findBase(scene);
      return base ? findLegs(scene).map((leg) => ({ kind: "cylinder" as const, x: leg.cx, z: leg.cz, y: base.box.maxY - inches(1 / 16), w: inches(PEG_W), d: inches(PEG_W), h: inches(PEG_L) })) : null;
    },
    check: needLegs((legs, base, scene) => {
      for (const leg of legs) {
        const side = leg.cx < base.cx ? "left" : "right";
        const peg = basePeg(scene, base, leg);
        if (!peg) return fail(`Put a peg on the base under the ${side} boot: 1/4 in across, 1/16 in inside the base, sticking up into the boot.`);
        if (peg.topId !== base.topId) return fail(`Select the peg under the ${side} boot and the base and press Group.`);
        const problem = jointProblem(scene, peg, `under the ${side} boot`);
        if (problem) return problem;
        if (holeFor(scene, peg)!.topId !== leg.topId) return fail(`Group the hole under the ${side} boot with that leg.`);
      }
      return pass();
    }),
    success: "Four joints: the nutcracker will stand firmly on its base.",
    hint: "If the boot's hole goes into the leg too, that's fine: they are one piece.",
  },
];

/* ---------- head ---------- */

const headSteps: LessonStep[] = [
  {
    id: "head-place",
    title: "Add the head",
    body: "Drag a Cylinder onto the workplane for the head. A nutcracker's head is tall: make it 1 5/8 in across and 2 1/4 in tall.",
    skill: "Resize by typing",
    figure: { parts: [...TOP.slice(0, -1), added(HEAD)], caption: "Taller than it is wide." },
    check: (scene) => {
      const head = anyHead(scene);
      if (!head) return fail("Drag a Cylinder onto the workplane and make it 1 5/8 in across and 2 1/4 in tall.");
      return sizeAdvice("head", head.w, 1.375, 2.125, "1 5/8 in", "across") ?? sizeAdvice("head", head.h, 1.75, 2.75, "2 1/4 in", "tall") ?? pass();
    },
    didYouKnow: "A round head works too: try a Sphere stretched taller.",
  },
  {
    id: "head-align",
    title: "Put it on the body",
    body: "Select the head and the body and Align their centres both ways. Lift the head until about 1/8 in of it sinks into the top of the body: type its height above the workplane as the body's top minus 1/8 in (5 7/8 in).\n\nDon't group them: you'll give them different colours. Because they overlap, they print as one piece.",
    skill: "Align",
    figure: { parts: TOP, caption: "1/8 in of the head goes into the body." },
    ghost: ghostHead,
    check: needBody((body, scene) => {
      const head = anyHead(scene);
      if (!head) return fail("Add the head first.");
      if (!centred(head, body)) return fail("Select the head and the body and Align their centres both ways.");
      const overlap = body.box.maxY - head.box.minY;
      if (overlap < inches(1 / 32)) return fail(`The head is ${formatInches(Math.abs(overlap))} ${overlap < 0 ? "above" : "into"} the body. Lower it so it sinks about 1/8 in in.`);
      if (overlap > inches(0.375)) return fail(`The head sinks ${formatInches(overlap)} into the body. Raise it so only about 1/8 in is inside.`);
      return pass();
    }),
    success: "Head and body overlap, so they'll print as one piece.",
  },
];

/* ---------- face ---------- */

const faceSteps: LessonStep[] = [
  {
    id: "face-workplane",
    title: "Find the face",
    body: "Use the Workplane tool and click the front of the head. New shapes now land on the face. (Click the workplane tool again on the grid to put it back later.)",
  },
  {
    id: "face-eyes",
    title: "Eyes",
    body: "Two small Spheres or Ellipses, about 1/4 in across and 1/8 in thick, about 1/2 in below the top of the head. Place one, then Duplicate and Mirror it. Select both eyes and the head and Align them to the middle left to right.",
    skill: "Mirror",
    figure: { parts: [...TOP, ...both(added(EYE))] },
    check: needHead((head, _body, scene) => (mirroredPair(onHead(scene, head, 0.45), head.cx, 1) ? pass() : fail("Add two matching eyes, the same distance from the middle of the face."))),
    didYouKnow: "Thin Crescents above the eyes make bushy eyebrows.",
  },
  {
    id: "face-nose",
    title: "Nose",
    body: "A Cone or a stretched Sphere about 3/8 in long, pointing out from the middle of the face below the eyes. Turn a Cone 90 degrees so it points forward. Align it with the head left to right.",
    skill: "Rotate",
    figure: { parts: [...TOP, ...both(done(EYE)), added(NOSE)] },
    check: needHead((head, _body, scene) => {
      const nose = onHead(scene, head).find((part) => Math.abs(part.cx - head.cx) <= 1 && part.cz > head.cz + head.d * 0.3 && between(Math.max(...ownSizes(part)), inches(0.2), inches(0.8)));
      return nose ? pass() : fail("Add a nose 1/4 to 3/4 in long on the front of the face, centred left to right.");
    }),
  },
  {
    id: "face-mustache",
    title: "Mustache",
    body: "Stretch a Sphere into one side of a mustache: 5/8 in long, 1/4 in tall, 3/16 in thick. Tilt it a little and put it under the nose. Duplicate it, Mirror it, and move it to the other side so the two halves meet under the nose.",
    skill: "Mirror",
    figure: { parts: [...TOP, ...both(done(EYE)), done(NOSE), ...both(added(MUSTACHE))] },
    check: needHead((head, _body, scene) => (mirroredPair(onHead(scene, head).filter((part) => Math.max(...ownSizes(part)) >= inches(0.4)), head.cx, 1.5) ? pass() : fail("Add two matching mustache halves, mirror images, under the nose."))),
  },
  {
    id: "face-mouth",
    title: "Open the mouth",
    body: "Drag a Box and make it a Hole: 3/4 in wide, 9/16 in tall and 1/4 in deep. Put it on the front of the face below the mustache so it cuts a square mouth about 1/8 in deep. Select the hole and the head and press Group.",
    skill: "Hole",
    figure: { parts: [...FACE, hole(MOUTH)], caption: "A square mouth, cut into the face." },
    check: needHead((head, _body, scene) => {
      const mouth = holes(scene).find((cut) => touches(cut, head, 0) && cut.cz > head.cz && cut.cy < head.cy && Math.abs(cut.cx - head.cx) <= inches(0.15));
      if (!mouth) return fail("Add a Box Hole on the front of the face, below the mustache, centred left to right.");
      return mouth.topId === head.topId ? pass() : fail("Select the mouth hole and the head and press Group, so the hole cuts the mouth.");
    }),
    hint: "Grouping the hole with the head only cuts the head. The body is a separate object, so it isn't cut.",
  },
  {
    id: "face-teeth",
    title: "Teeth",
    body: "These teeth are for show, not for cracking nuts. Make one tooth: a Box 3/32 in wide, 1/8 in tall and 1/16 in thick, standing in the top of the mouth and touching the face.\n\nWith the tooth selected, open Pattern, choose Row, and make 6 copies 1/8 in apart left to right. Do the same along the bottom of the mouth if you like.",
    skill: "Pattern in a row",
    figure: { parts: [...FACE, hole(MOUTH), ...teeth(HEAD_Y + 0.6)], caption: "A row of six matching teeth." },
    check: needHead((head, _body, scene) => {
      const small = onHead(scene, head, 0.3).filter((part) => part.cy < head.cy);
      return sameSizeCount(small) >= 4 ? pass() : fail("Make one small tooth touching the face in the mouth, then Pattern it in a row so there are at least 4 matching teeth.");
    }),
    didYouKnow: "Pattern spaces copies exactly evenly. Try 1/8 in apart, then 5/32 in, and see which looks best.",
  },
  {
    id: "face-measure",
    title: "Measure the details",
    body: "Open the Ruler and measure the smallest detail on the face. Nothing should be thinner than 1/16 in, or it may break off or not print.",
    skill: "Measure",
    check: needHead((head, _body, scene) => {
      const tiny = onHead(scene, head).filter((part) => ownSizes(part)[0] < inches(1 / 16) - 0.1);
      return tiny.length ? fail(`${tiny.length === 1 ? "One detail is" : `${tiny.length} details are`} thinner than 1/16 in. Make ${tiny.length === 1 ? "it" : "them"} a little thicker.`) : pass();
    }),
    didYouKnow: "Most printers can't make details smaller than the nozzle, usually about 1/64 in (0.4 mm).",
  },
];

/* ---------- hair ---------- */

const hairChoices: LessonChoice[] = [
  {
    id: "modelled",
    label: "Modelled hair",
    blurb: "Long hair down the sides, from shapes.",
    steps: [{
      id: "hair-sides",
      title: "Hair at the sides",
      body: "Stretch a Sphere into a long lock of hair, about 1/2 in wide, 3/4 in deep and 2 in tall. Put it against one side of the head, near the back, from under the hat down to the shoulder. Duplicate it, Mirror it, and move it to the other side.",
      skill: "Mirror",
      figure: { parts: [...FACE, ...both(added({ shape: "ellipse", x: -0.9, y: HEAD_Y + 0.1, w: 0.5, h: 2 }))] },
      check: needHead((head, _body, scene) => (mirroredPair(solids(scene).filter((part) => part !== head && touches(part, head, 1) && Math.abs(part.cx - head.cx) > head.w * 0.3 && Math.max(...ownSizes(part)) >= inches(0.75)), head.cx, 1.5) ? pass() : fail("Add two matching locks of hair, mirror images, touching the sides of the head."))),
      didYouKnow: "Thin Wedge holes grouped into each lock cut strands.",
    }],
  },
  {
    id: "beard",
    label: "Beard",
    blurb: "A big beard under the mouth.",
    steps: [{
      id: "hair-beard",
      title: "The beard",
      body: "Stretch a Sphere into a beard about 1 1/2 in wide, 1 1/4 in tall and 3/4 in thick. Put it on the front of the chin so it hangs over the top of the body, below the mouth. Align it with the head left to right.",
      skill: "Resize on one axis",
      figure: { parts: [...FACE, added({ shape: "ellipse", x: 0, y: HEAD_Y - 0.6, w: 1.5, h: 1.25 })] },
      check: needHead((head, _body, scene) => {
        const beard = solids(scene).find((part) => part !== head && touches(part, head, 1) && part.cy < head.box.minY + head.h * 0.35 && part.cz >= head.cz && part.w >= inches(0.75));
        if (!beard) return fail("Add a beard at least 3/4 in wide on the front of the chin, touching the head.");
        return Math.abs(beard.cx - head.cx) <= 1 ? pass() : fail("Align the beard with the head left to right.");
      }),
    }],
  },
  {
    id: "fur",
    label: "Fur (glue on after printing)",
    blurb: "A pocket to glue real fur or wool into.",
    steps: [{
      id: "hair-fur",
      title: "A pocket for fur",
      body: "Faux fur or wool glued on after printing makes soft, fluffy hair. Give the glue a place to hold: a Box Hole 1 3/4 in wide, 1 1/2 in tall and 1/8 in deep across the back of the head, under the hat. Group it with the head so it cuts a shallow pocket.",
      skill: "Hole",
      figure: { parts: [...FACE, hole({ shape: "rect", x: 0, y: HEAD_Y + 0.5, w: 1.75, h: 1.5 })], caption: "Seen from the back: a shallow pocket for the fur." },
      check: needHead((head, _body, scene) => {
        const pocket = holes(scene).find((cut) => touches(cut, head, 0) && cut.cz < head.cz && cut.w >= inches(0.5));
        if (!pocket) return fail("Add a Box Hole across the back of the head.");
        return pocket.topId === head.topId ? pass() : fail("Select the pocket hole and the head and press Group.");
      }),
      didYouKnow: "Glue the fur in after painting, so paint doesn't soak into it.",
    }],
  },
  {
    id: "pen",
    label: "3D pen hair",
    blurb: "Grooves to trace with a 3D pen.",
    steps: [{
      id: "hair-pen",
      title: "Grooves for the 3D pen",
      body: "After printing you'll draw hair with a 3D pen. Grooves help the pen lines stay put. Make a thin Box Hole, 1/16 in wide, 1/16 in deep and 1 1/2 in long, on the side of the head where the hair goes. Duplicate it a few times, tilting each copy a little. Group the grooves with the head.",
      skill: "Duplicate",
      check: needHead((head, _body, scene) => {
        const grooves = holes(scene).filter((cut) => touches(cut, head, 0) && cut.cz < head.cz + head.d * 0.25 && ownSizes(cut)[0] <= inches(0.1));
        if (!grooves.length) return fail("Add a thin Box Hole on the side or back of the head.");
        return grooves.some((cut) => cut.topId === head.topId) ? pass() : fail("Select the grooves and the head and press Group.");
      }),
      didYouKnow: "Practise with the 3D pen on scrap first: slow, steady lines stick best.",
    }],
  },
];

/* ---------- hat ---------- */

const hatPlace = (id: string, title: string, body: string, kind: GhostPart["kind"], w: number, h: number, target: string, figure: FigurePart): LessonStep => ({
  id,
  title,
  body,
  skill: "Align",
  figure: { parts: [...FACE, added(figure)] },
  ghost: (scene) => onTopOfHead(scene, (head) => [{ kind, x: head.cx, z: head.cz, y: head.box.maxY - inches(0.25), w: inches(w), d: inches(w), h: inches(h) }]),
  check: needHat((hat, head) => {
    const advice = sizeAdvice("hat", hat.w, 1.5, 2.5, `about ${target}`, "across");
    if (advice) return advice;
    return centred(hat, head) ? pass() : fail("Select the hat and the head and Align their centres both ways.");
  }),
});

const hatChoices: LessonChoice[] = [
  {
    id: "soldier",
    label: "Soldier's hat",
    blurb: "A tall hat with a brim and a plume.",
    steps: [
      hatPlace("hat-tall", "The tall hat", "Drag a Cylinder 1 3/4 in across and 1 3/4 in tall. Align it with the head both ways and lift it so its bottom sinks 1/4 in over the top of the head.", "cylinder", 1.75, 1.75, "1 3/4 in", HAT),
      {
        id: "hat-brim",
        title: "The band and visor",
        body: "A Cylinder 2 1/8 in across and 1/8 in thick goes around the bottom of the hat as a band. Align it with the hat's centre. For a visor, add a flattened Half Sphere at the front.",
        skill: "Resize by typing",
        figure: { parts: [...FACE, done(HAT), added(BRIM)] },
        check: needHat((hat, _head, scene) => {
          const band = solids(scene).find((part) => part !== hat && part.w > hat.w && part.h < inches(0.45) && touches(part, hat));
          if (!band) return fail("Add a flat Cylinder band wider than the hat, touching it.");
          return centred(band, hat) ? pass() : fail("Align the band to the centre of the hat.");
        }),
      },
      {
        id: "hat-plume",
        title: "Plume or badge",
        body: "Stretch a Sphere into a plume (1/2 x 1/2 x 1 1/4 in) and stand it on top of the hat, or put a Star on the front of the hat as a badge. It must touch the hat.",
        skill: "Resize on one axis",
        figure: { parts: [...FACE, done(HAT), done(BRIM), added({ shape: "ellipse", x: 0, y: HEAD_TOP + 1.4, w: 0.5, h: 1.25 })] },
        check: needHat((hat, head, scene) => (solids(scene).some((part) => part !== hat && part !== head && touches(part, hat, 0.5) && (part.cy > hat.box.maxY - inches(0.1) || part.cz > hat.cz + hat.d * 0.3) && part.w < hat.w) ? pass() : fail("Add a plume on top of the hat or a badge on its front, touching the hat."))),
      },
    ],
  },
  {
    id: "helmet",
    label: "Helmet",
    blurb: "A rounded helmet with a spike.",
    steps: [
      hatPlace("helmet-dome", "The helmet", "Drag a Half Sphere 1 7/8 in across and 1 in tall. Align it with the head both ways and lift it so its bottom sinks 1/4 in over the top of the head.", "halfSphere", 1.875, 1, "1 7/8 in", { shape: "dome", x: 0, y: HEAD_TOP - 0.25, w: 1.875, h: 1 }),
      {
        id: "helmet-spike",
        title: "Rim and spike",
        body: "Put a thin Torus around the bottom of the helmet as a rim, and a Cone 3/8 in across and 1/2 in tall on top as a spike. Align both with the helmet's centre.",
        skill: "Align",
        figure: { parts: [...FACE, done({ shape: "dome", x: 0, y: HEAD_TOP - 0.25, w: 1.875, h: 1 }), added({ shape: "tri", x: 0, y: HEAD_TOP + 0.7, w: 0.375, h: 0.5 })] },
        check: needHat((hat, _head, scene) => {
          const spike = solids(scene).find((part) => part !== hat && touches(part, hat, 0.5) && part.cy > hat.box.maxY - inches(0.15) && part.w < hat.w / 2);
          if (!spike) return fail("Add a small Cone on top of the helmet, touching it.");
          return centred(spike, hat, 1) ? pass() : fail("Align the spike to the centre of the helmet.");
        }),
      },
    ],
  },
  {
    id: "crown",
    label: "Crown",
    blurb: "A king's crown with points and jewels.",
    steps: [
      hatPlace("crown-band", "The crown band", "Drag a Tube 1 7/8 in across and 5/8 in tall, with a 1/8 in wall. Align it with the head both ways and lift it so it sits around the top of the head, its bottom 1/4 in below the top.", "cylinder", 1.875, 0.625, "1 7/8 in", { shape: "rect", x: 0, y: HEAD_TOP - 0.25, w: 1.875, h: 0.625 }),
      {
        id: "crown-points",
        title: "Points all round",
        body: "Make one point: a Cone 3/8 in across and 1/2 in tall, standing on the rim of the band. Then use Pattern, Circle, around the centre of the crown with 8 copies, so the points go all the way round.",
        skill: "Circular pattern",
        figure: { parts: [...FACE, done({ shape: "rect", x: 0, y: HEAD_TOP - 0.25, w: 1.875, h: 0.625 }), ...[-0.75, -0.25, 0.25, 0.75].map((x) => added({ shape: "tri" as const, x, y: HEAD_TOP + 0.375, w: 0.375, h: 0.5 }))] },
        check: needHat((hat, _head, scene) => (sameSizeCount(solids(scene).filter((part) => part !== hat && touches(part, hat, 1) && part.w < hat.w / 2)) >= 5 ? pass() : fail("Make one point on the band and Pattern it around the circle so there are at least 5 matching points."))),
        didYouKnow: "A Paraboloid inside the crown makes a tall cap, and small Spheres on the points make it fancy.",
      },
      {
        id: "crown-jewels",
        title: "Jewels",
        body: "Put small Spheres or Stars (1/4 in) on the front of the band as jewels. Pattern them around the band too if you like.",
        skill: "Circular pattern",
        check: needHat((hat, _head, scene) => (solids(scene).some((part) => part !== hat && touches(part, hat, 0.5) && Math.max(...ownSizes(part)) <= inches(0.45) && part.cy < hat.box.maxY) ? pass() : fail("Add a small jewel on the band, touching it."))),
      },
    ],
  },
];

/* ---------- arms ---------- */

const armSteps: LessonStep[] = [
  {
    id: "arm-one",
    title: "One arm",
    body: "Drag a Cylinder 5/8 in across and 2 1/2 in tall for the arm, and a Sphere 5/8 in across for the hand. Stand the arm against the left side of the body, its top level with the shoulder, and put the hand at the bottom, sinking into the arm a little. Group the arm and the hand.",
    skill: "Group",
    figure: { parts: [...FACE, added(ARM), added(HAND)] },
    ghost: (scene) => {
      const body = findBody(scene);
      return body ? [{ kind: "cylinder", x: body.box.minX - inches(ARM_W / 2), z: body.cz, y: body.box.maxY - inches(ARM_L) - inches(0.125), w: inches(ARM_W), d: inches(ARM_W), h: inches(ARM_L) }] : null;
    },
    check: needBody((body, scene) => {
      const arm = findArms(scene)[0];
      if (!arm) return fail("Stand a long Cylinder against the side of the body, touching it.");
      return solids(scene).some((part) => part !== arm && part.topId === arm.topId) ? pass() : fail("Add a hand and Group it with the arm.");
    }),
    didYouKnow: "Tilt the arm forward a little, or bend it with a second Cylinder at the elbow, so the hand can hold something.",
  },
  {
    id: "arm-peg",
    title: "Shoulder joint",
    body: "Arms join with a peg too. Make a peg 1/4 in across and 9/16 in long and turn it 90 degrees so it lies sideways, pointing into the body. Put it at the shoulder, 1/16 in inside the arm and 1/2 in into the body, and Group it with the arm.\n\nDuplicate the peg, make the copy a Hole 9/32 in across and 5/8 in long, Align it to the peg's centre, and Group the hole with the body.",
    skill: "Peg-and-hole joint",
    check: needBody((body, scene) => {
      const arm = findArms(scene)[0];
      if (!arm) return fail("Build the arm first.");
      const peg = armPeg(scene, arm, body);
      if (!peg) return fail("Put a sideways peg at the top of the arm, pointing into the body, and Group it with the arm.");
      const problem = jointProblem(scene, peg, "at the shoulder");
      if (problem) return problem;
      return holeFor(scene, peg)!.topId === body.topId ? pass() : fail("Group the shoulder hole with the body.");
    }),
    hint: "Use the curved arrow around the peg, or type 90 into its tilt, to turn it sideways.",
  },
  {
    id: "arm-mirror",
    title: "Mirror the other arm",
    body: "Duplicate the arm (its peg comes with it), Mirror it left to right, and move it to the other side of the body. Make the second shoulder hole the same way and Group it with the body.",
    skill: "Mirror",
    figure: { parts: FINISHED },
    check: needBody((body, scene) => {
      const pair = mirroredPair(findArms(scene), body.cx, 2);
      if (!pair) return fail("Make the second arm a mirror image of the first, on the other side of the body.");
      for (const arm of pair) {
        const peg = armPeg(scene, arm, body);
        if (!peg) return fail("Each arm needs its shoulder peg, grouped with it, pointing into the body.");
        const problem = jointProblem(scene, peg, "at the shoulder");
        if (problem) return problem;
      }
      return pass();
    }),
    success: "Two arms that will slide into the shoulders.",
  },
];

/* ---------- uniform ---------- */

const uniformChoices: LessonChoice[] = [
  {
    id: "belt",
    label: "Belt and buckle",
    blurb: "A band around the waist with a buckle.",
    steps: [{
      id: "uniform-belt",
      title: "Belt and buckle",
      body: "Make a belt: a Cylinder 1/8 in wider than the body and 1/4 in tall around the middle of the body, Aligned to its centre. Then put a buckle on the front: a small flat Box, or a Tube with 6 sides.",
      skill: "Align",
      figure: { parts: [...FACE, added({ shape: "rect", x: 0, y: LEG_TOP + 1, w: BODY_W + 0.125, h: 0.25 })] },
      check: needBody((body, scene) => {
        const belt = solids(scene).find((part) => part !== body && part.w >= body.w * 0.95 && part.w <= body.w + inches(0.5) && between(part.h, inches(0.1), inches(0.6)) && part.box.minY > body.box.minY && part.box.maxY < body.box.maxY);
        if (!belt) return fail("Add a band 1/8 to 1/2 in tall around the middle of the body, a little wider than the body.");
        return centred(belt, body) ? pass() : fail("Align the belt to the body's centre.");
      }),
    }],
  },
  {
    id: "buttons",
    label: "Buttons and trim",
    blurb: "A row of buttons or gold bars down the front.",
    steps: [{
      id: "uniform-buttons",
      title: "A row of buttons",
      body: "Make one button: a Cylinder 1/4 in across and 1/16 in thick, turned to face forward on the front of the body. Then use Pattern, Row, with 4 copies spaced 3/8 in apart up the body.\n\nFor trim, use a thin Box bar 1 in wide instead, the way soldiers' jackets have gold bars.",
      skill: "Pattern in a row",
      figure: { parts: [...FACE, ...[0.6, 1, 1.4, 1.8].map((y) => added({ shape: "ellipse" as const, x: 0, y: LEG_TOP + y, w: 0.25, h: 0.25 }))] },
      check: needBody((body, scene) => (sameSizeCount(solids(scene).filter((part) => part !== body && touches(part, body, 1) && part.cz > body.cz && Math.max(...ownSizes(part)) <= inches(1.25) && ownSizes(part)[0] <= inches(0.25))) >= 3 ? pass() : fail("Pattern a button or bar in a row so there are at least 3 matching ones on the front of the body."))),
    }],
  },
  {
    id: "epaulettes",
    label: "Shoulder pads",
    blurb: "Epaulettes on each shoulder.",
    steps: [{
      id: "uniform-epaulettes",
      title: "Epaulettes",
      body: "Flatten a Half Sphere or a Cylinder (3/4 in across, 1/4 in tall) and put it on one shoulder. Duplicate it, Mirror it, and move it to the other shoulder.",
      skill: "Mirror",
      check: needBody((body, scene) => (mirroredPair(solids(scene).filter((part) => part !== body && touches(part, body, 1) && part.box.maxY >= body.box.maxY - inches(0.25) && part.h <= inches(0.6) && part.w <= inches(1.25)), body.cx, 2) ? pass() : fail("Add two matching pads, one on each shoulder."))),
    }],
  },
];

/* ---------- accessories ---------- */

const swordSteps: LessonStep[] = [
  {
    id: "sword-blade",
    title: "The blade",
    body: "A Box 3/16 in wide, 3/32 in thick and 3 1/2 in long for the blade.",
    skill: "Resize by typing",
    figure: { parts: [added({ shape: "rect", x: 0, y: 1.2, w: 0.1875, h: 3.5 })] },
    check: (scene) => (solids(scene).some((part) => ownSizes(part)[2] >= inches(2.5) && ownSizes(part)[1] <= inches(0.4)) ? pass() : fail("Make a long thin Box, about 3 1/2 in long.")),
  },
  {
    id: "sword-guard",
    title: "Guard and handle",
    body: "Add a flat Box (3/4 x 1/8 x 1/8 in) across the blade where it ends as the guard, and a Cylinder 3/16 in across and 1 1/8 in long as the handle. Align all three on the blade's centre line and Group them.",
    skill: "Align",
    figure: { parts: [done({ shape: "rect", x: 0, y: 1.2, w: 0.1875, h: 3.5 }), added({ shape: "rect", x: 0, y: 1.1, w: 0.75, h: 0.125 }), added({ shape: "rect", x: 0, y: 0, w: 0.19, h: 1.125 })] },
    check: (scene) => {
      const blade = solids(scene).find((part) => ownSizes(part)[2] >= inches(2.5) && ownSizes(part)[1] <= inches(0.4));
      if (!blade) return fail("Make the blade first: a long thin Box, about 3 1/2 in long.");
      return solids(scene).filter((part) => part !== blade && part.topId === blade.topId).length >= 2 ? pass() : fail("Add the guard and the handle, then select all three and Group them.");
    },
  },
  {
    id: "sword-hold",
    title: "In the hand",
    body: "Put the handle in a hand, or stand the sword on the base leaning against the body. It must touch the nutcracker in at least two places so it doesn't snap off.",
    skill: "Rotate",
    check: accessoryTouches("sword"),
    success: "The sword touches the nutcracker and will print.",
  },
];

const staffSteps: LessonStep[] = [
  {
    id: "staff-pole",
    title: "The pole",
    body: "A Cylinder 1/4 in across and 6 in tall. Stand it on the base beside one boot, so it reaches up to a hand.",
    skill: "Resize by typing",
    figure: { parts: [...STANDING, added({ shape: "rect", x: 1.7, y: BASE_H, w: 0.25, h: 6 })] },
    check: (scene) => {
      const base = findBase(scene);
      const pole = solids(scene).find((part) => part.h >= inches(4) && ownSizes(part)[0] <= inches(0.5));
      if (!pole) return fail("Make a tall thin Cylinder, about 6 in tall.");
      return base && touches(pole, base) ? pass() : fail("Stand the pole on the base.");
    },
  },
  {
    id: "staff-top",
    title: "The top",
    body: "Put a Cone on top for a spear, a Sphere for a knob, or a Star. Group it with the pole. Then move the staff so it touches the hand or the body.",
    skill: "Group",
    check: (scene) => {
      const pole = solids(scene).find((part) => part.h >= inches(4) && ownSizes(part)[0] <= inches(0.5));
      if (!pole) return fail("Make the pole first.");
      if (!solids(scene).some((part) => part !== pole && part.topId === pole.topId && part.cy > pole.cy)) return fail("Put a shape on top of the pole and Group them.");
      return accessoryTouches("staff")(scene);
    },
  },
];

const scepterSteps: LessonStep[] = [
  {
    id: "scepter-rod",
    title: "Rod and top",
    body: "A Cylinder 3/16 in across and 3 in long as the rod, with a Sphere 1/2 in across on top. Add a small Star or Crown points on the Sphere if you like, then Group.",
    skill: "Group",
    figure: { parts: [added({ shape: "rect", x: 0, y: 0, w: 0.1875, h: 3 }), added({ shape: "ellipse", x: 0, y: 2.9, w: 0.5, h: 0.5 })] },
    check: (scene) => {
      const rod = solids(scene).find((part) => part.kind === "cylinder" && between(ownSizes(part)[2], inches(2), inches(4.5)) && ownSizes(part)[0] <= inches(0.3));
      if (!rod) return fail("Make a thin Cylinder rod about 3 in long.");
      const knob = solids(scene).find((part) => part !== rod && (part.kind === "sphere" || part.kind === "ellipse") && touches(part, rod));
      if (!knob) return fail("Put a Sphere on top of the rod.");
      return knob.topId === rod.topId ? pass() : fail("Select the rod and the sphere and Group them.");
    },
    didYouKnow: "A flat Cylinder disc on top, painted in stripes, makes a peppermint scepter.",
  },
  {
    id: "scepter-hold",
    title: "In the hand",
    body: "Put the scepter in a hand, or lean it on the body with its bottom on the base. It must touch the nutcracker.",
    skill: "Rotate",
    check: accessoryTouches("scepter"),
  },
];

const ornamentSteps: LessonStep[] = [
  {
    id: "ornament-ball",
    title: "The ornament",
    body: "A Sphere 1 in across for the ornament, a small Cylinder cap (3/8 in across, 1/8 in tall) on top, and a thin Torus loop on the cap. Group all three.",
    skill: "Group",
    figure: { parts: [added({ shape: "ellipse", x: 0, y: 0, w: 1, h: 1 }), added({ shape: "rect", x: 0, y: 0.95, w: 0.375, h: 0.125 }), added({ shape: "ellipse", x: 0, y: 1.05, w: 0.3, h: 0.3 })] },
    check: (scene) => {
      const ball = solids(scene).find((part) => (part.kind === "sphere" || part.kind === "ellipse") && between(part.w, inches(0.6), inches(1.6)));
      if (!ball) return fail("Make a Sphere about 1 in across.");
      const loop = solids(scene).find((part) => part.kind === "torus" && part.topId === ball.topId);
      return loop ? pass() : fail("Add a Torus loop on top and Group it with the ball and cap.");
    },
  },
  {
    id: "ornament-hold",
    title: "Hold or hang it",
    body: "Put the ornament in a hand, or stand it on the base beside a boot. It must touch the nutcracker.",
    check: accessoryTouches("ornament"),
  },
];

/* ---------- print prep ---------- */

/**
 * Gold and silver: the colours for parts to paint metallic. Only colours close to these count, so
 * the shapes' own starting colours (orange, yellow, grey) don't pass by accident.
 */
const METALLIC = ["#d4af37", "#ffd700", "#c0c0c0", "#cfd8df"];

export function isMetallicColour(colour: string) {
  const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return false;
  const [r, g, b] = rgb(colour);
  return METALLIC.some((metal) => {
    const [mr, mg, mb] = rgb(metal);
    return Math.hypot(r - mr, g - mg, b - mb) <= 18;
  });
}

/** The printed pieces: every top-level object with solid parts. */
function pieces(scene: LessonScene) {
  const byTop = new Map<string, Part[]>();
  for (const part of solids(scene)) byTop.set(part.topId, [...(byTop.get(part.topId) ?? []), part]);
  const names = new Map(topObjects(scene).map((part) => [part.shape.id, part.shape.name]));
  return [...byTop.entries()].map(([id, parts]) => ({
    id,
    name: names.get(id) ?? "a part",
    parts,
    bottom: Math.min(...parts.map((part) => part.box.minY)),
  }));
}

const printSteps: LessonStep[] = [
  {
    id: "print-floating",
    title: "Find floating parts",
    body: "Every part must touch the nutcracker, or it falls off the print. The check below tells you if anything is floating.",
    skill: "Check for floating parts",
    check: (scene) => {
      const floating = floatingObjects(scene);
      if (floating.length) return fail(`${floating.length} part${floating.length === 1 ? " is" : "s are"} floating: ${floating.map((part) => part.shape.name).slice(0, 3).join(", ")}. Move ${floating.length === 1 ? "it" : "them"} until ${floating.length === 1 ? "it touches" : "they touch"} the nutcracker.`);
      const thin = thinParts(scene);
      return thin.length ? fail(`${thin.length === 1 ? "One part is" : `${thin.length} parts are`} thinner than 0.05 in. Make ${thin.length === 1 ? "it" : "them"} a little thicker so ${thin.length === 1 ? "it prints" : "they print"}.`) : pass();
    },
    success: "Everything is connected.",
  },
  {
    id: "print-size",
    title: "Measure the whole nutcracker",
    body: "Select everything and drag the Ruler to a corner of the nutcracker. It should be 8 to 10 in tall. Because it prints in pieces, up to 12 in is fine.\n\nToo short or too tall? Select everything and use Scale by percent, so every part grows or shrinks together. Then check the joints again (next step): scaling changes the pegs and holes too.",
    skill: "Measure",
    check: (scene) => {
      const top = Math.max(...solids(scene).map((part) => part.box.maxY));
      if (between(top, inches(8), inches(10))) return pass(`Your nutcracker is ${formatInches(top)} tall.`);
      if (between(top, inches(10), inches(12))) return pass(`Your nutcracker is ${formatInches(top)} tall: taller than 10 in, but fine because it prints in pieces.`);
      const percent = Math.round((inches(9.5) / top) * 100);
      return fail(`Your nutcracker is ${formatInches(top)} tall. Aim for 8 to 10 in: select everything and use Scale by percent at about ${percent} % to make it 9 1/2 in, without changing its shape.`);
    },
    success: "The right height.",
  },
  {
    id: "print-joints",
    title: "Check every joint",
    body: "Every peg needs a hole that is 1/32 in wider and a little deeper, grouped with the piece it slides into. The check looks at each joint.",
    skill: "Clearance",
    check: allJoints,
  },
  {
    id: "print-metallic",
    title: "Plan the paint",
    body: "Nutcrackers shine. Give each part the colour you'll paint it (or print it in): red jacket, black boots, skin-coloured face. Give the parts you'll paint metallic, like buttons, belt buckle, crown or sword, gold or silver: in the shape's colour box, type #D4AF37 for gold, or pick the light silver.\n\nSelect a part and pick its colour in the shape's card. Your teacher will see your paint plan.",
    skill: "Colour",
    check: (scene) => {
      const colours = solids(scene).map((part) => part.shape.color.toLowerCase());
      if (new Set(colours).size < 3) return fail("Give the parts at least three different colours: your paint plan.");
      return colours.some(isMetallicColour) ? pass() : fail("Give the parts you'll paint metallic gold (type #D4AF37 in the colour box) or silver (the light silver colour, or #C0C0C0).");
    },
    didYouKnow: "Silk or metallic filament prints shiny straight off the printer, without paint.",
  },
  {
    id: "print-bundle",
    title: "Bundle each piece",
    body: "Each piece should be one object. Select the body, head, face, hair and hat (not the legs, base or arms) and press Bundle (Ctrl+B). A bundle holds parts together but keeps their colours.\n\nBundle an accessory with whatever it touches: the arm that holds it, or the base it stands on.",
    skill: "Bundle",
    check: needBody((body, scene) => {
      const head = findHead(scene);
      if (head && head.topId !== body.topId) return fail("The head and body are separate objects. Select the top piece's parts and Bundle them (Ctrl+B).");
      const hat = findHat(scene);
      return hat && hat.topId !== body.topId ? fail("The hat isn't in the top piece. Bundle it with the body and head.") : pass();
    }),
  },
  {
    id: "print-layout",
    title: "Lay out the pieces",
    body: "Pull the pieces apart so none touch: the base, each leg, the top piece and each arm. Put each one flat on the workplane: select it and use Drop to workplane. Turn the arms so they lie on their side.",
    skill: "Plan a print",
    check: (scene) => {
      const parts = pieces(scene);
      if (parts.length < 4) return fail(`There are ${parts.length} pieces. Pull apart at least the base, two legs and the top.`);
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          if (parts[i].parts.some((a) => parts[j].parts.some((b) => touches(a, b, 0)))) return fail(`${parts[i].name} and ${parts[j].name} touch. Bundle them if they print as one piece, or move them apart.`);
        }
      }
      const lifted = parts.find((piece) => piece.bottom > 0.5);
      return lifted ? fail(`${lifted.name} is ${formatInches(lifted.bottom)} above the workplane. Select it and use Drop to workplane.`) : pass(`${parts.length} pieces, ready to print.`);
    },
    hint: "The legs and the top print standing up, pegs and all. The holes face down, and that's fine.",
  },
  {
    id: "print-finish",
    title: "Paint and gloss",
    body: "After printing: push the pegs into their holes. A tight peg can be sanded a little; a loose one gets a drop of glue.\n\nPaint with acrylics, using metallic gold or silver on the parts you coloured gold or silver. When the paint is dry, give the nutcracker a gloss finish (a brush-on gloss varnish or a clear gloss spray, used by your teacher in a ventilated space) so it shines.",
    didYouKnow: "Painting before you glue the pieces together makes it easier to reach every side.",
  },
  {
    id: "print-done",
    title: "Congratulations!",
    body: "You designed a nutcracker that prints in pieces and snaps together. Export it as 3MF from the export menu. Your teacher can see your finished design in LayerLab.",
  },
];

/* ---------- the lesson ---------- */

const nutcracker: Lesson = {
  id: "nutcracker",
  title: "Nutcracker",
  subtitle: "Design, 3D print and paint your own nutcracker",
  freestyleIdeas: "Build a second nutcracker (a king, a drummer, the Mouse King), or add more to yours.",
  units: "Imperial",
  sections: [
    { id: "welcome", title: "Welcome", goal: "Learn where nutcrackers come from, see your choices, and name your design.", skills: [], steps: welcome, guidedOnly: true },
    {
      id: "base",
      title: "Base",
      goal: "Give your nutcracker a stable stand about 4 in across and 1/2 in tall.",
      skills: ["Resize by typing", "Align", "Group", "Measure"],
      choices: baseChoices,
      ownWayChecks: [
        { label: "A flat stand at least 3 in wide on the workplane", check: (scene) => (findBase(scene)?.w ?? 0) >= inches(3) ? pass() : fail("Make a flat stand at least 3 in wide, standing on the workplane.") },
      ],
    },
    {
      id: "legs",
      title: "Legs and boots",
      goal: "Stand two matching legs, with boots or shoes, on the base, each its own piece.",
      skills: ["Position by typing", "Resize on one axis", "Group", "Mirror"],
      choices: legChoices,
      after: legSteps,
      ownWayChecks: [
        { label: "Two matching legs with boots or shoes stand on the base", check: needLegs(() => pass()) },
        { label: "Each leg is its own piece", check: needLegs(([left, right]) => (left.topId !== right.topId ? pass() : fail("Keep each leg its own object."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "body",
      title: "Body",
      goal: "Stand a body about 2 1/4 in wide and 2 3/4 in tall on the legs, without grouping it to them.",
      skills: ["Resize by typing", "Align"],
      choices: bodyChoices,
      after: bodyAfter,
      ownWayChecks: [
        { label: "A body sits on top of the legs", check: needLegs((legs, _base, scene) => {
          const body = findBody(scene);
          return body && legs.every((leg) => touches(leg, body)) ? pass() : fail("Rest the body on the tops of both legs.");
        }) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "joints",
      title: "Peg joints",
      goal: "Join the legs to the body and the base with pegs, each in a hole 1/32 in bigger.",
      skills: ["Peg-and-hole joint", "Clearance", "Group"],
      steps: jointSteps,
      ownWayChecks: [{ label: "Every peg has a hole with room to fit", check: allJoints }],
    },
    {
      id: "head",
      title: "Head",
      goal: "Put a tall head on the body, centred and sunk in a little.",
      skills: ["Resize by typing", "Align"],
      steps: headSteps,
      ownWayChecks: [
        { label: "A head sits on the body", check: needHead((head, body) => (touches(head, body) ? pass() : fail("The head must touch the body."))) },
        { label: "It is centred over the body", check: needHead((head, body) => (centred(head, body) ? pass() : fail("Use Align to centre it."))) },
      ],
    },
    {
      id: "face",
      title: "Face",
      goal: "Give your nutcracker eyes, a nose, a mustache and a mouth with teeth, all 3D.",
      skills: ["Workplane on a face", "Mirror", "Rotate", "Hole", "Pattern in a row", "Measure"],
      steps: faceSteps,
      ownWayChecks: [
        { label: "3D features are on the face", check: needHead((head, _body, scene) => (onHead(scene, head).length >= 3 ? pass() : fail("Add at least three features to the face."))) },
        { label: "It has a row of teeth", check: needHead((head, _body, scene) => (sameSizeCount(onHead(scene, head, 0.3)) >= 4 ? pass() : fail("Add at least 4 matching teeth."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "hair",
      title: "Hair",
      goal: "Give your nutcracker hair: modelled, a beard, a pocket for fur, or grooves for a 3D pen.",
      skills: ["Mirror", "Resize on one axis", "Hole", "Duplicate"],
      multi: true,
      choices: hairChoices,
      ownWayChecks: [
        { label: "Hair, a fur pocket or pen grooves are on the head", check: needHead((head, _body, scene) => (solids(scene).some((part) => part !== head && touches(part, head, 1) && part.w >= inches(0.4) && Math.abs(part.cx - head.cx) > head.w * 0.3) || holes(scene).some((cut) => cut.topId === head.topId && cut.cz < head.cz) ? pass() : fail("Add hair at the sides or back of the head, or cut a pocket or grooves for it."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "hat",
      title: "Hat",
      goal: "Top the head with a hat, a helmet or a crown.",
      skills: ["Align", "Resize by typing", "Circular pattern", "Resize on one axis"],
      choices: hatChoices,
      ownWayChecks: [
        { label: "A hat covers the top of the head", check: needHat(() => pass()) },
        { label: "It is centred on the head", check: needHat((hat, head) => (centred(hat, head) ? pass() : fail("Use Align to centre it."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "arms",
      title: "Arms",
      optional: true,
      goal: "Add two arms that join the shoulders with peg joints.",
      skills: ["Group", "Peg-and-hole joint", "Rotate", "Mirror"],
      steps: armSteps,
      ownWayChecks: [
        { label: "Two arms touch the body", check: needBody((body, scene) => (findArms(scene).length >= 2 ? pass() : fail("Add an arm on each side of the body."))) },
        { label: "Every peg has a hole with room to fit", check: allJoints },
      ],
    },
    {
      id: "uniform",
      title: "Uniform",
      optional: true,
      goal: "Dress the jacket: a belt, buttons or trim, or shoulder pads.",
      skills: ["Align", "Pattern in a row", "Mirror"],
      multi: true,
      choices: uniformChoices,
      ownWayChecks: [{ label: "It will print", check: printable }],
    },
    {
      id: "accessory",
      title: "Accessory",
      goal: "Give your nutcracker something to hold: a sword, staff, scepter or ornament.",
      skills: ["Resize by typing", "Align", "Group", "Rotate"],
      multi: true,
      choices: [
        { id: "sword", label: "Sword", blurb: "A soldier's sabre in the hand.", steps: swordSteps },
        { id: "staff", label: "Staff or spear", blurb: "A tall staff standing on the base.", steps: staffSteps },
        { id: "scepter", label: "Scepter", blurb: "A king's scepter with a ball on top.", steps: scepterSteps },
        { id: "ornament", label: "Ornament", blurb: "A round ornament with a loop.", steps: ornamentSteps },
      ],
      ownWayChecks: [{ label: "It touches the nutcracker and will print", check: printable }],
    },
    {
      id: "print",
      title: "Print prep",
      goal: "Check the nutcracker and its joints, plan the metallic paint, and lay out the pieces to print.",
      skills: ["Check for floating parts", "Measure", "Clearance", "Colour", "Bundle", "Plan a print"],
      guidedOnly: true,
      steps: printSteps,
    },
    {
      id: "freestyle",
      title: "Freestyle",
      optional: true,
      freestyle: true,
      goal: "Design without steps: a new nutcracker, a Mouse King, or more on yours.",
      skills: [],
      ownWayChecks: [{ label: "Nothing is too thin to print", check: (scene) => {
        const thin = thinParts(scene);
        return thin.length ? fail(`${thin.length === 1 ? "One part is" : `${thin.length} parts are`} thinner than 0.05 in. Make ${thin.length === 1 ? "it" : "them"} a little thicker.`) : pass();
      } }],
    },
  ],
};

export { findBase, findBody, findHead, findHat, findLegs, findPegs };
export default nutcracker;
