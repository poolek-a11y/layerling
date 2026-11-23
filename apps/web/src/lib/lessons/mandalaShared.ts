import { between, connectedAndPrintable, fail, formatInches, inches, pass, topObjects, type Part } from "@/lib/lessons/sceneChecks";
import { mandalaCentreOf } from "@/lib/lessons/mandalaPlace";
import type { LessonScene, LessonSection, LessonStep, StepCheck } from "@/lib/lessons/types";

/*
 * What the two mandala lessons (Traditional Mandala and Mandala Cross) share: reading the stack of
 * layers, the steps on strokes and offsets, the student's own motif and library, and the print
 * check. Both build five layers the same way: a bottom layer of outlines drawn as strokes, then
 * offset layers whose lines are set in a little from the ones below, so each line rests on a line
 * and the layer beneath still shows. A closed back is an option, not the default.
 *
 * Sizes in the text are inches; the checks compare in millimetres with generous ranges.
 */

const CENTRE_TOLERANCE = inches(0.12);
const LEVEL_TOLERANCE = inches(0.03);

/** The layers are made of the design's top-level objects: rings from the builders, offset layers, or copies grouped into one. */
const objects = (scene: LessonScene) => topObjects(scene).filter((part) => !part.hole);

/** The base: the widest object standing on the plate. */
export function findBase(scene: LessonScene): Part | null {
  return objects(scene)
    .filter((part) => part.box.minY < LEVEL_TOLERANCE)
    .sort((a, b) => b.w * b.d - a.w * a.d)[0] ?? null;
}

/** How far a part's middle is from the base's: a builder ring's middle is its sketch's, not its box's. */
function offset(part: Part, base: Part) {
  const a = mandalaCentreOf(part.shape, part.box);
  const b = mandalaCentreOf(base.shape, base.box);
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Objects that are off the middle: a ring that slid when it was moved, or pattern copies not grouped yet. */
export function offCentre(scene: LessonScene) {
  const base = findBase(scene);
  if (!base) return [];
  return objects(scene).filter((part) => offset(part, base) > CENTRE_TOLERANCE);
}

/**
 * The layers, from the bottom up: the objects centred on the base, grouped by the height they
 * stand at. A layer counts when it stands on the top of the one below it.
 */
export function layersOf(scene: LessonScene): Part[][] {
  const base = findBase(scene);
  if (!base) return [];
  const centred = objects(scene).filter((part) => offset(part, base) <= CENTRE_TOLERANCE).sort((a, b) => a.box.minY - b.box.minY);
  const levels: Part[][] = [];
  for (const part of centred) {
    const level = levels.find((entry) => Math.abs(entry[0].box.minY - part.box.minY) <= LEVEL_TOLERANCE);
    if (level) level.push(part);
    else levels.push([part]);
  }
  const layers: Part[][] = [];
  for (const level of levels) {
    if (!layers.length) {
      if (level[0].box.minY < LEVEL_TOLERANCE) layers.push(level);
      continue;
    }
    const below = layers[layers.length - 1];
    const top = Math.max(...below.map((part) => part.box.maxY));
    if (Math.abs(level[0].box.minY - top) <= LEVEL_TOLERANCE) layers.push(level);
  }
  return layers;
}

export const hasStroke = (part: Part) => Boolean(part.shape.sketchProfile?.stroke);

export const needBase = (what: string, then: (base: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => (scene) => {
  const base = findBase(scene);
  return base ? then(base, scene) : fail(`Start with the bottom layer: click empty space, open Shape builders, choose ${what} and press Add to my design.`);
};

/** The bottom layer is about the right size: 3 to 6 1/2 in across, 1/16 to 1/4 in thick. */
export const baseSize = (what: string): StepCheck => needBase(what, (base) => {
  if (base.w < inches(3) && base.d < inches(3)) return fail(`The bottom layer is ${formatInches(Math.max(base.w, base.d))} across. Make it at least 3 in so the layers have room.`);
  if (base.w > inches(6.5) || base.d > inches(6.5)) return fail(`The bottom layer is ${formatInches(Math.max(base.w, base.d))} across. Keep it under 6 1/2 in so it fits the printer and prints quickly.`);
  if (!between(base.h, inches(0.06), inches(0.3))) return fail(`The bottom layer is ${formatInches(base.h)} thick. Between 1/16 and 1/4 in is best.`);
  return pass();
});

/** The bottom layer holds at least `count` centred pieces (the outline and the rings drawn level with it). */
export const bottomPieces = (what: string, count: number, missing: string): StepCheck => needBase(what, (_base, scene) => {
  const off = offCentre(scene);
  if (off.length) return fail(`${off[0].shape.name || "A ring"} is off the middle. Undo, select the outline, and add it again with Same layer.`);
  const bottom = layersOf(scene)[0] ?? [];
  return bottom.length >= count ? pass() : fail(missing);
});

/** `count` layers stacked, the newest centred and drawn as strokes (a solid centre button is fine on the top). */
export const layerCount = (what: string, count: number, options: { stroked?: boolean } = {}): StepCheck => needBase(what, (base, scene) => {
  const off = offCentre(scene);
  if (off.length) return fail(`${off[0].shape.name || "A layer"} is off the middle. Select the layer below first, then add the new one: it goes on top, centred. Copies made with Pattern need to be grouped into one.`);
  const layers = layersOf(scene);
  if (layers.length < count) {
    return fail(`So far ${layers.length} layer${layers.length === 1 ? "" : "s"} stand on each other. Select the top layer, then add layer ${layers.length + 1} on top of it.`);
  }
  const newest = layers[count - 1];
  if (newest.some((part) => part.w > base.w + inches(0.05))) return fail(`Layer ${count} is wider than the bottom layer. Keep each layer within the one below.`);
  if (options.stroked && newest.some((part) => !hasStroke(part))) return fail(`Draw layer ${count} as a stroke (an outline), so the layer beneath shows through. Use Offset layer, or switch on Build as a stroke in Edit sketch.`);
  return pass();
});

export const printable: StepCheck = (scene) => {
  const off = offCentre(scene);
  if (off.length) return fail(`${off[0].shape.name || "A layer"} is off the middle.`);
  return connectedAndPrintable(scene, "the rest of the design");
};

/* ---------- steps both lessons use ---------- */

export const strokesStep = (name: string): LessonStep => ({
  id: `${name}-strokes`,
  title: "Lines, not solid shapes",
  body: "Every layer you build is drawn as a stroke: a line with a width, like a marker on paper. The Line width setting in every shape builder is that stroke.\n\nEach layer above is an offset layer: the same lines, set in a little. The new line rests half on the line below, so the lower line still shows beside it. Stack five and you get the stepped, carved look of a layered mandala.",
  didYouKnow: "A closed back is an option: set the bottom outline's Line width to 0 and it is built solid. It prints a little more easily but hides the open, lacy look, so try it with lines first.",
});

export const offsetSteps = (name: string, what: string): LessonStep[] => [
  {
    id: `${name}-layer2`,
    title: "Layer 2: the first offset layer",
    skill: "Offset layer",
    body: "Select the whole bottom layer: drag a box around it, or click the outline and Shift-click every ring in it. Open Shape builders and choose Offset layer.\n\nSet in by is how far each line moves inward. Keep it about half the Line width (about 1/32 in for a 1/16 in line) so the new line rests on the old one. Press Add the offset layer.",
    check: layerCount(what, 2, { stroked: true }),
    success: "Layer 2 rests on layer 1, and the edge of layer 1 still shows beside it.",
    hint: "If Set in by is as big as the Line width, the new line misses the old one and would print in the air. The library warns you when that happens.",
  },
  {
    id: `${name}-layer3`,
    title: "Layer 3: a step smaller",
    skill: "Offset layer",
    body: "Select layer 2 and choose Offset layer again. This time tick Leave out the outermost outline, so the outer edge stays one layer lower. Press Add the offset layer.\n\nLook at it from the side: the edge steps down to layers 2 and 1.",
    check: layerCount(what, 3, { stroked: true }),
    success: "Three layers, each one a step in from the last.",
  },
  {
    id: `${name}-layer4`,
    title: "Layer 4: one more step",
    skill: "Offset layer",
    body: "Select layer 3 and add another Offset layer. Leave out the outermost outline again if you want the petals to end a step lower, or keep it to make them taller.\n\nWant different colours? Each layer is its own body: give each one a colour and change filament at each layer when you print.",
    check: layerCount(what, 4, { stroked: true }),
    success: "Four layers. One more to go.",
  },
];

export const centreStep = (name: string, what: string): LessonStep => ({
  id: `${name}-layer5`,
  title: "Layer 5: the centre",
  skill: "Stacking layers",
  body: "Select layer 4. In Shape builders choose Star or Centre circle, leave it On top, and size it so its lines cross the circle in the middle of layer 4. Press Add to my design.\n\nThe very top is the one place where a solid piece looks good: set the Line width to 0 for a solid centre button.",
  check: needBase(what, (_base, scene) => {
    const layers = layersOf(scene);
    if (layers.length < 5) return fail(`You have ${layers.length} layers so far. The centre is layer 5, on top of layer 4.`);
    const top = layers[4].sort((a, b) => b.w - a.w)[0];
    return between(top.w, inches(0.4), inches(2)) ? pass() : fail(`The centre is ${formatInches(top.w)} across. Between 1/2 and 2 in sits nicely on the middle.`);
  }),
  success: "Five layers! Look at it from every side.",
});

export const ownMotifSteps = (name: string): LessonStep[] => [
  {
    id: `${name}-draw`,
    title: "Draw a motif of your own",
    skill: "Sketch and stroke",
    body: "Click empty space. Start a new sketch (Sketch in the top bar) and draw one petal, leaf, heart or swirl with Line and Bezier Curve. Keep it about 1 in long.\n\nOpen Stroke, switch on Build as a stroke and set a Width of about 1/16 in. Press Finish sketch.",
    hint: "An open line (a swirl or a wave) only works as a stroke. A closed shape can be a stroke or filled in.",
  },
  {
    id: `${name}-repeat`,
    title: "Repeat it around the middle",
    skill: "Pattern",
    body: "Move your motif so it points away from the middle. Then open Pattern, choose Circle as the Layout, and set the Count (with original) to 4, 6, 8 or 12. Set the centre to the middle of your design and switch on Turn with circle. Press Create.\n\nGroup the copies so they are one ring. Offset layer works on your own sketches too: select the ring and stack offset layers on it.",
  },
];

export const librarySteps = (name: string): LessonStep[] => [
  {
    id: `${name}-save-motif`,
    title: "Save it to your library",
    skill: "Your motif library",
    body: "Select a ring or a layer you like: one of your own, or a builder ring you changed. Open Shape builders, go to My motifs and press Save the selection.\n\nYour motif is kept in your library (the Mandala motifs folder of My shapes) and follows you to every design. Next time, click it to put it in a new mandala.",
    didYouKnow: "Keep adding to your library as you get better: a motif that worked, a border you drew, a stack of offset layers you liked. Artists keep sketchbooks of motifs for the same reason.",
  },
];

export const printSteps = (name: string): LessonStep[] => [
  {
    id: `${name}-print-check`,
    title: "Ready to print?",
    body: "Check that every layer sits on the one below and that nothing is floating.\n\nIt prints flat, the bottom layer on the plate, with no supports: every line stands on a line. Change filament at each layer's height for a colour change, or print it in one colour and paint it.",
    check: printable,
    success: "Ready to print. Every layer touches the one below.",
  },
];

/** The sections after the five layers, the same in both lessons. */
export const closingSections = (name: string, freestyleGoal: string): LessonSection[] => [
  {
    id: "own-motif",
    title: "Your own motif",
    optional: true,
    goal: "A motif you drew yourself with the sketch tool and a stroke, repeated around the middle.",
    skills: ["Sketch and stroke", "Pattern"],
    steps: ownMotifSteps(name),
  },
  { id: "library", title: "Your motif library", goal: "Save a ring you made to My motifs, so you can use it in any design.", skills: ["Your motif library"], steps: librarySteps(name), guidedOnly: true },
  { id: "print", title: "Check and print", goal: "Every layer touches the one below; nothing floats.", skills: [], steps: printSteps(name), guidedOnly: true },
  { id: "freestyle", title: "Freestyle", goal: freestyleGoal, skills: [], freestyle: true },
];

/** Sections 2 to 5: the offset layers and the centre. */
export const upperSections = (name: string, what: string): LessonSection[] => {
  const [two, three, four] = offsetSteps(name, what);
  const centre = centreStep(name, what);
  return [
    { id: "layer-2", title: "Layer 2", goal: "An offset layer of the whole bottom layer, resting on it.", skills: ["Offset layer"], steps: [two], ownWayChecks: [{ label: "Two layers, centred, drawn as strokes", check: two.check! }] },
    { id: "layer-3", title: "Layer 3", goal: "An offset layer a step smaller.", skills: ["Offset layer"], steps: [three], ownWayChecks: [{ label: "Three layers, centred, drawn as strokes", check: three.check! }] },
    { id: "layer-4", title: "Layer 4", goal: "One more offset layer.", skills: ["Offset layer"], steps: [four], ownWayChecks: [{ label: "Four layers, centred, drawn as strokes", check: four.check! }] },
    { id: "layer-5", title: "Layer 5", goal: "A centre on top, in the middle.", skills: ["Stacking layers"], steps: [centre], ownWayChecks: [{ label: "Five layers with a centre on top", check: centre.check! }] },
  ];
};

export const nameStep = (name: string, prefix: string): LessonStep => ({
  id: `${name}-name`,
  title: "Name your design",
  body: `Click the design's name at the top of the screen and rename it ${prefix}_ followed by your name, for example ${prefix}_Maya. Press Enter.`,
  check: (scene) => (new RegExp(`^${prefix}_\\S+`, "i").test((scene.projectName ?? "").trim()) ? pass() : fail(`Rename the design ${prefix}_ followed by your name, for example ${prefix}_Maya.`)),
  success: "Your teacher can find your design by its name.",
  hint: "The name box is in the middle of the top bar. Click it, type the new name, and press Enter.",
});

export const buildersStep = (name: string): LessonStep => ({
  id: `${name}-builders`,
  title: "Your shape builders",
  body: "Press Shape builders and my motifs at the top of this panel. Each builder makes one whole shape or ring: you choose how many copies go around, how big they are, and the Line width.\n\nOn top puts the new ring on top of what is selected. Same layer puts it level with the selection, beside it. Offset layer builds the next layer from the selected one.",
  didYouKnow: "Each ring is an ordinary sketch. Select it and press Edit sketch to move its points or change its stroke later.",
});
