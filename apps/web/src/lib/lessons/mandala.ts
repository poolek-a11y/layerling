import { between, connectedAndPrintable, fail, formatInches, inches, pass, topObjects, type Part } from "@/lib/lessons/sceneChecks";
import { mandalaCentreOf } from "@/lib/lessons/mandalaPlace";
import type { Lesson, LessonChoice, LessonScene, LessonStep, StepCheck } from "@/lib/lessons/types";

/*
 * Layered Mandala: the lesson content. A mandala here is a stack of thin rings round one middle,
 * each ring a motif repeated round the circle. The shape builders (mandalaMotifs.ts, opened with
 * "Shape builders" at the top of the panel) put each ring down as a sketch body, so the lesson is
 * about planning the layers, the stroke (outline or filled), criss-cross lattices, and keeping
 * every layer centred and touching the one below so it prints as one piece. Students then draw
 * motifs of their own and keep them in their library ("My motifs").
 *
 * Sizes in the text are inches; the checks compare in millimetres with generous ranges.
 */

/* ---------- reading the stack ---------- */

const CENTRE_TOLERANCE = inches(0.12);
const STACK_TOLERANCE = inches(0.03);

/** The layers are the design's top-level objects: a ring from a builder, or copies grouped into one. */
const objects = (scene: LessonScene) => topObjects(scene).filter((part) => !part.hole);

/** The base: the widest object standing on the plate. */
function findBase(scene: LessonScene): Part | null {
  return objects(scene)
    .filter((part) => part.box.minY < inches(0.03))
    .sort((a, b) => b.w * b.d - a.w * a.d)[0] ?? null;
}

/** How far a part's middle is from the base's: a builder ring's middle is its sketch's, not its box's. */
function offset(part: Part, base: Part) {
  const a = mandalaCentreOf(part.shape, part.box);
  const b = mandalaCentreOf(base.shape, base.box);
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Every solid centred over the base, from the bottom up (the base first). */
function stack(scene: LessonScene): Part[] {
  const base = findBase(scene);
  if (!base) return [];
  return objects(scene)
    .filter((part) => offset(part, base) <= CENTRE_TOLERANCE)
    .sort((a, b) => a.box.minY - b.box.minY || b.w - a.w);
}

/** Objects that are off the middle: a layer that slid when it was moved, or pattern copies not grouped yet. */
function offCentre(scene: LessonScene) {
  const base = findBase(scene);
  if (!base) return [];
  return objects(scene).filter((part) => offset(part, base) > CENTRE_TOLERANCE);
}

/** The layers that sit on the one below them, counting the base as the first. */
function stackedLayers(scene: LessonScene): Part[] {
  const parts = stack(scene);
  if (!parts.length) return [];
  const layers = [parts[0]];
  for (const part of parts.slice(1)) {
    const sitsOnSomething = layers.some((below) => Math.abs(part.box.minY - below.box.maxY) <= STACK_TOLERANCE || between(part.box.minY, below.box.minY - STACK_TOLERANCE, below.box.maxY));
    if (sitsOnSomething) layers.push(part);
  }
  return layers;
}

const hasStroke = (part: Part) => Boolean(part.shape.sketchProfile?.stroke);

const needBase = (then: (base: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => (scene) => {
  const base = findBase(scene);
  return base ? then(base, scene) : fail("Start with the base: open Shape builders, choose Scalloped base and press Add to my design.");
};

/** The `count`th layer is on: `count` layers centred and touching, the newest smaller than the base. */
const layerCount = (count: number, extra?: (layer: Part, base: Part) => ReturnType<StepCheck> | null): StepCheck => needBase((base, scene) => {
  const off = offCentre(scene);
  if (off.length) return fail(`${off[0].shape.name || "A layer"} is off the middle. Select the layer below first, then add the new layer: it goes on top, centred. Copies made with Pattern need to be grouped into one layer.`);
  const layers = stackedLayers(scene);
  if (layers.length < count) {
    return fail(`So far ${layers.length} layer${layers.length === 1 ? "" : "s"} sit on each other. Select the top layer, then add the next one from Shape builders.`);
  }
  const newest = layers[layers.length - 1];
  if (newest.w > base.w + inches(0.05)) return fail(`The top layer is ${formatInches(newest.w)} wide, wider than the base (${formatInches(base.w)}). Make it smaller so it sits on the base.`);
  return extra?.(newest, base) ?? pass();
});

/* ---------- welcome ---------- */

const welcome: LessonStep[] = [
  {
    id: "mandala-meet",
    title: "What is a mandala?",
    body: "Mandala means \"circle\" in Sanskrit. Mandalas appear in Hindu and Buddhist art, in the rose windows of cathedrals, in Islamic tile patterns and in Navajo sand paintings. They are built around one centre point, and every ring repeats the same motif around that point.\n\nThat repeat is called radial symmetry. Flowers, snowflakes and sea urchins have it too.",
  },
  {
    id: "mandala-plan",
    title: "How you'll build it",
    body: "Your mandala is a stack of thin layers, like a layered paper cut-out. The base is the biggest. Each layer above it is a little smaller, so the layers below show around its edge.\n\nYou'll build: a scalloped base, a ring of petals, a criss-cross lattice, a ring of details, and a centre button. Then you'll draw a motif of your own and save it to your library.",
  },
  {
    id: "mandala-builders",
    title: "Your shape builders",
    body: "Press Shape builders at the top of this panel. Each builder makes one whole ring: you choose how many copies go around the circle, how far from the middle they start, how long and wide they are, and the line width.\n\nLine width is the sketch tool's stroke. With a width, each motif is built as an outline, like a line drawn with a marker. Set it to 0 and the motif is filled in instead.",
    didYouKnow: "Each ring is an ordinary sketch. Select it and press Edit sketch to move its points or change its stroke later.",
  },
  {
    id: "mandala-name",
    title: "Name your design",
    body: "Click the design's name at the top of the screen and rename it Mandala_ followed by your name, for example Mandala_Maya. Press Enter.",
    check: (scene) => (/^mandala_\S+/i.test((scene.projectName ?? "").trim()) ? pass() : fail("Rename the design Mandala_ followed by your name, for example Mandala_Maya.")),
    success: "Your teacher can find your design by its name.",
    hint: "The name box is in the middle of the top bar. Click it, type the new name, and press Enter.",
  },
];

/* ---------- base ---------- */

const baseSteps: LessonStep[] = [
  {
    id: "mandala-base",
    title: "Add the scalloped base",
    skill: "Shape builders",
    body: "Click an empty spot on the workplane so nothing is selected. Open Shape builders, choose Scalloped base and press Add to my design.\n\nThe base is about 4 1/4 in across and 1/8 in thick. Try 12 to 20 bumps on its edge.",
    check: needBase((base) => {
      if (base.w < inches(3)) return fail(`Your base is ${formatInches(base.w)} across. Make it at least 3 in so the layers have room.`);
      if (base.w > inches(6.5)) return fail(`Your base is ${formatInches(base.w)} across. Keep it under 6 1/2 in so it fits the printer and prints quickly.`);
      if (!between(base.h, inches(0.06), inches(0.3))) return fail(`Your base is ${formatInches(base.h)} thick. Between 1/16 and 1/4 in is best.`);
      return pass();
    }),
    success: "A solid base. Everything else stacks on this.",
    hint: "If something was selected, the base goes on top of it. Press Esc or click empty space first, so it sits on the plate.",
  },
];

/* ---------- first ring: petals ---------- */

const petalStep = (choice: string, name: string, tip: string): LessonStep => ({
  id: `mandala-petals-${choice}`,
  title: `Add a ring of ${name.toLowerCase()}`,
  skill: "Stacking layers",
  body: `Select the base. Open Shape builders, choose ${name} and press Add to my design. The new ring goes on top of what is selected, right in the middle.\n\n${tip}`,
  check: layerCount(2),
  success: "Two layers, centred. Look at it from the side: the petals sit right on the base.",
  hint: "If the ring landed on the plate, undo (Ctrl+Z), select the base, and add it again.",
});

const petalChoices: LessonChoice[] = [
  { id: "lotus", label: "Lotus petals", blurb: "Round at the bottom, pointed at the tip.", steps: [petalStep("lotus", "Lotus petals", "8 to 12 petals look like a flower. The petals should stop before the edge of the base, about 1/4 in in.")] },
  { id: "teardrop", label: "Teardrops", blurb: "Pointed toward the middle, round on the outside.", steps: [petalStep("teardrop", "Teardrops", "Try 12. Make Starts from the middle bigger to push the drops out toward the edge.")] },
  { id: "leaf", label: "Leaves", blurb: "Pointed at both ends.", steps: [petalStep("leaf", "Leaves", "Try 8 leaves, then 16 narrow ones. Which do you like better?")] },
];

const strokeSteps: LessonStep[] = [
  {
    id: "mandala-stroke",
    title: "Outline or filled?",
    skill: "Sketch stroke",
    body: "Select your petal ring and press Edit sketch. In the sketch toolbar, open Stroke.\n\nBuild as a stroke draws every outline with a line of the Width you set. Turn it off and the petals are filled in. Position puts the line inside, outside or centred on the outline you drew.\n\nTry it both ways, then press Finish sketch.",
    didYouKnow: "A centred stroke grows half its width on each side of the line you drew. That's why a 1/16 in line makes the petals look a little fatter.",
    hint: "Edit sketch is in the shape's card on the right when the ring is selected. You can also double-click the ring.",
  },
];

/* ---------- criss-cross ---------- */

const crissStep = (choice: string, name: string, tip: string): LessonStep => ({
  id: `mandala-criss-${choice}`,
  title: `Add ${name.toLowerCase()}`,
  skill: "Criss-cross lattice",
  body: `Select the petal ring. Open Shape builders, choose ${name} and press Add to my design.\n\n${tip}\n\nThese motifs overlap their neighbours on purpose. With a stroke, every line crosses the next one and the crossings become a lattice. Filled in, they would melt into one blob, so these builders always use a line.`,
  check: layerCount(3, (layer) => (hasStroke(layer) ? null : fail("Build the lattice with a stroke: Edit sketch, then switch on Build as a stroke in Stroke."))),
  success: "A criss-cross lattice! The crossings hold it together as one piece.",
  hint: "Make the circles or petals longer and they overlap more. More copies make a tighter weave.",
});

const crissChoices: LessonChoice[] = [
  { id: "circles", label: "Criss-cross circles", blurb: "Overlapping circles, like a spirograph.", steps: [crissStep("circles", "Criss-cross circles", "Start with 12 circles. Try a turn of half a step (15° for 12) to line the circles up between your petals.")] },
  { id: "petals", label: "Criss-cross petals", blurb: "Wide leaves that weave over each other.", steps: [crissStep("petals", "Criss-cross petals", "Wider petals cross more. Try Width 1 in with 12 petals.")] },
];

/* ---------- details ---------- */

const detailSteps: LessonStep[] = [
  {
    id: "mandala-details",
    title: "Add a ring of details",
    skill: "Spacing a ring",
    body: "Details make a mandala look finished. Select a layer and add Dots, Spikes, Diamonds or Rays from Shape builders. Change Starts from the middle until the ring sits where you want it: around the edge of the base, between two rings, or close to the centre.\n\nA ring of details can sit on the base around the outside of the other layers. Select the base first for that.",
    check: needBase((_base, scene) => {
      const layers = stackedLayers(scene);
      if (offCentre(scene).length) return fail("One of your layers is off the middle. Select the layer below, then add the ring again.");
      return layers.length >= 4 ? pass() : fail(`You have ${layers.length} layers. Add a ring of details for 4.`);
    }),
    success: "Detailed! Try a Ring builder with a thin line as a frame between two layers.",
  },
];

/* ---------- centre ---------- */

const centreSteps: LessonStep[] = [
  {
    id: "mandala-centre",
    title: "Finish with a centre button",
    skill: "Stacking layers",
    body: "Select the top layer. Add a Centre button, or a Star, from Shape builders. It goes on top, exactly in the middle.\n\nKeep it between 1/2 and 1 1/4 in across.",
    check: needBase((_base, scene) => {
      const layers = stackedLayers(scene);
      const top = layers.slice(1).sort((a, b) => b.box.maxY - a.box.maxY)[0];
      if (!top) return fail("Add the layers before the centre.");
      if (!between(top.w, inches(0.4), inches(1.5))) return fail(`The top piece is ${formatInches(top.w)} across. A centre button between 1/2 and 1 1/4 in sits nicely on the middle.`);
      return layers.length >= 5 ? pass() : fail(`You have ${layers.length} layers so far. The centre button should be the 5th or more.`);
    }),
    success: "Your mandala has a centre. Every ring now turns around it.",
  },
];

/* ---------- your own motif ---------- */

const ownMotifSteps: LessonStep[] = [
  {
    id: "mandala-draw",
    title: "Draw a motif of your own",
    skill: "Sketch and stroke",
    body: "Click empty space. Start a new sketch (Sketch in the top bar) and draw one petal, leaf, heart or swirl with Line and Bezier Curve. Keep it about 1 in long.\n\nOpen Stroke, switch on Build as a stroke and set a Width of about 1/16 in. Press Finish sketch.",
    hint: "An open line (a swirl or a wave) only works as a stroke. A closed shape can be a stroke or filled in.",
  },
  {
    id: "mandala-repeat",
    title: "Repeat it around a circle",
    skill: "Pattern",
    body: "Move your motif so it points away from the middle of your mandala. Then open Pattern, choose Circle as the Layout, and set the Count (with original) to 6, 8 or 12. Set the centre to the middle of your mandala and switch on Turn with circle. Press Create.\n\nGroup the copies so they move as one layer, and lift them so they sit on top of a layer.",
    didYouKnow: "Shape builders do exactly this for you, but in one sketch: the ring stays one body you can edit.",
  },
];

/* ---------- library ---------- */

const librarySteps: LessonStep[] = [
  {
    id: "mandala-save-motif",
    title: "Save it to your library",
    skill: "Your motif library",
    body: "Select a ring you like: one of your own, or a builder ring you changed. Open Shape builders, go to My motifs and press Save the selection.\n\nYour motif is kept in your library (the Mandala motifs folder of My shapes) and follows you to every design. Next time, press Add on it to put it in a new mandala.",
    didYouKnow: "Keep adding to your library as you get better: a motif that worked, a lattice you tuned, a border you drew. Artists keep sketchbooks of motifs for the same reason.",
  },
];

/* ---------- check and print ---------- */

const finalSteps: LessonStep[] = [
  {
    id: "mandala-print-check",
    title: "Ready to print?",
    body: "Check that every layer sits on the one below and that nothing is floating. The check below finds parts that don't touch.\n\nA mandala prints flat, the base on the plate, with no supports. Pause the print at each layer height to change filament colour, or print it in one colour and paint it.",
    check: (scene) => {
      const off = offCentre(scene);
      if (off.length) return fail(`${off[0].shape.name || "A layer"} is off the middle.`);
      return connectedAndPrintable(scene, "the mandala");
    },
    success: "Ready to print. Every layer touches the one below.",
  },
];

/* ---------- the lesson ---------- */

const printChecks = [{ label: "Every layer touches the one below and nothing floats", check: (scene: LessonScene) => connectedAndPrintable(scene, "the mandala") }];

const mandala: Lesson = {
  id: "mandala",
  title: "Layered Mandala",
  subtitle: "Rings of motifs, stacked in layers",
  units: "Imperial",
  library: "mandala",
  freestyleText: "No steps here. Build a new mandala from your library, try a different number of copies in every ring, or design a whole set of coasters. Here is every skill you have used so far:",
  sections: [
    { id: "welcome", title: "Welcome", goal: "Learn what a mandala is and how you'll build it.", skills: [], steps: welcome, guidedOnly: true },
    {
      id: "base",
      title: "Base",
      goal: "A flat round base about 4 in across and 1/8 in thick, lying on the plate.",
      skills: ["Shape builders"],
      steps: baseSteps,
      ownWayChecks: [{ label: "A flat base at least 3 in across on the plate", check: baseSteps[0].check! }],
    },
    {
      id: "petals",
      title: "Petal ring",
      goal: "A ring of petals centred on the base and sitting on it.",
      skills: ["Shape builders", "Stacking layers", "Sketch stroke"],
      choices: petalChoices,
      after: strokeSteps,
      ownWayChecks: [{ label: "Two layers, centred and stacked", check: layerCount(2) }],
    },
    {
      id: "criss-cross",
      title: "Criss-cross lattice",
      goal: "A ring of overlapping outlines that cross into a lattice, on top of the petals.",
      skills: ["Criss-cross lattice", "Sketch stroke"],
      choices: crissChoices,
      ownWayChecks: [{ label: "Three layers, centred and stacked", check: layerCount(3) }],
    },
    {
      id: "details",
      title: "Details",
      goal: "A ring of dots, spikes, diamonds or rays.",
      skills: ["Spacing a ring"],
      steps: detailSteps,
      ownWayChecks: [{ label: "Four layers, centred", check: detailSteps[0].check! }],
    },
    {
      id: "centre",
      title: "Centre",
      goal: "A centre button on top, in the middle.",
      skills: ["Stacking layers"],
      steps: centreSteps,
      ownWayChecks: [{ label: "A centre piece on top", check: centreSteps[0].check! }],
    },
    {
      id: "own-motif",
      title: "Your own motif",
      optional: true,
      goal: "A motif you drew yourself with the sketch tool and a stroke, repeated around the circle.",
      skills: ["Sketch and stroke", "Pattern"],
      steps: ownMotifSteps,
    },
    {
      id: "library",
      title: "Your motif library",
      goal: "Save a ring you made to My motifs, so you can use it in any design.",
      skills: ["Your motif library"],
      steps: librarySteps,
      guidedOnly: true,
    },
    { id: "print", title: "Check and print", goal: "Every layer touches the one below; nothing floats.", skills: [], steps: finalSteps, guidedOnly: true, ownWayChecks: printChecks },
    { id: "freestyle", title: "Freestyle", goal: "Make more mandalas with your library.", skills: [], freestyle: true },
  ],
};

export default mandala;
