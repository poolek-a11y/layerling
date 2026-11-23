import { baseSize, bottomPieces, buildersStep, closingSections, nameStep, strokesStep, upperSections } from "@/lib/lessons/mandalaShared";
import type { Lesson, LessonChoice, LessonStep } from "@/lib/lessons/types";

/*
 * Mandala Cross: a cross decorated the way a mandala is, in five layers. The bottom layer is a
 * cross outline with a petal along each arm and a circle at the crossing, all drawn as strokes;
 * layers 2 to 4 are offset layers set in from the one below; layer 5 is the centre. Shares its
 * steps and checks with Traditional Mandala (mandalaShared.ts).
 */

const NAME = "cross";
const WHAT = "a cross";

const welcome: LessonStep[] = [
  {
    id: "cross-meet",
    title: "A mandala cross",
    body: "Crosses decorated with repeating patterns are found in Celtic stone carving, Ethiopian processional crosses, Armenian khachkars and Mexican folk art. Like a mandala, the pattern turns around one centre point: the crossing. Whatever you put on one arm, you repeat on every arm.\n\nYou'll build yours as five thin layers of lines, like a carving in steps.",
  },
  {
    id: "cross-plan",
    title: "How you'll build it",
    body: "Layer 1: a cross outline with a petal along each arm and a circle at the crossing.\nLayer 2: an offset layer of all of it.\nLayer 3: an offset layer a step smaller.\nLayer 4: one more offset layer.\nLayer 5: the centre.\n\nThen you'll draw a motif of your own and save it to your library.",
  },
  strokesStep(NAME),
  buildersStep(NAME),
  nameStep(NAME, "Cross"),
];

const crossStep = (choice: string, name: string, tip: string): LessonStep => ({
  id: `cross-outline-${choice}`,
  title: "Layer 1: the cross outline",
  skill: "Shape builders",
  body: `Click an empty spot on the workplane so nothing is selected. Open Shape builders, choose ${name} and press Add to my design.\n\nArm reach is how far each arm goes from the middle (about 2 in), Arm width how wide the arms are (about 3/4 in). ${tip}`,
  check: baseSize(WHAT),
  success: "The outline of your cross.",
  hint: "If something was selected, the cross goes on top of it. Press Esc or click empty space first, so it sits on the plate.",
});

const crossChoices: LessonChoice[] = [
  { id: "round", label: "Round ends", blurb: "Each arm ends in a round lobe.", steps: [crossStep("round", "Cross, round ends", "For a taller cross, set Bottom arm longer by to about 1 in.")] },
  { id: "pointed", label: "Pointed ends", blurb: "Each arm flares out to a point.", steps: [crossStep("pointed", "Cross, pointed ends", "For a taller cross, set Bottom arm longer by to about 1 in.")] },
];

const insideSteps: LessonStep[] = [
  {
    id: "cross-petals",
    title: "A petal along each arm",
    skill: "Same layer",
    body: "Select the cross. Choose Lotus petals (or Leaves), pick Same layer, and set:\n\nCopies around: the number of arms (4).\nStarts from the middle: about 1/4 in.\nLength: until the tip almost reaches the end of the arm (about 1 3/4 in).\nWidth: the same as your Arm width, so the petal's sides touch the arm's sides.\n\nPress Add to my design.",
    check: bottomPieces(WHAT, 2, "Add petals level with the cross: select it, choose Lotus petals, pick Same layer and add them."),
    success: "A petal along every arm.",
    hint: "If your cross has a longer bottom arm, its petal stays the same size: that's fine, or add a Dots ring later to fill the extra length.",
  },
  {
    id: "cross-centre-circle",
    title: "A circle at the crossing",
    skill: "Same layer",
    body: "Select the petals. Choose Centre circle, pick Same layer, and set the Radius so the circle runs through the inside corners where the arms meet (about 0.7 x your Arm width, so 1/2 in for a 3/4 in arm). Add it.\n\nLayer 1 is done: cross, petals and circle, all lines, all touching.",
    check: bottomPieces(WHAT, 3, "Add a centre circle level with the petals, through the inside corners of the cross."),
    success: "Layer 1 is done.",
  },
];

const cross: Lesson = {
  id: "mandala-cross",
  title: "Mandala Cross",
  subtitle: "A cross in five layers of lines",
  units: "Imperial",
  library: "mandala",
  freestyleText: "No steps here. Try a cross with 6 or 8 arms, a Latin cross with a long bottom arm, or put a ring of dots around the crossing. Here is every skill you have used so far:",
  sections: [
    { id: "welcome", title: "Welcome", goal: "Learn about decorated crosses and how you'll build yours.", skills: [], steps: welcome, guidedOnly: true },
    {
      id: "layer-1",
      title: "Layer 1",
      goal: "A cross outline about 4 in across, with a petal along each arm and a circle at the crossing level with it, all drawn as lines that touch.",
      skills: ["Shape builders", "Same layer"],
      choices: crossChoices,
      after: insideSteps,
      ownWayChecks: [
        { label: "A bottom layer 3 to 6 1/2 in across on the plate", check: baseSize(WHAT) },
        { label: "At least three pieces in it, centred", check: bottomPieces(WHAT, 3, "Add the petals and the centre circle level with the cross.") },
      ],
    },
    ...upperSections(NAME, WHAT),
    ...closingSections(NAME, "Make more crosses and mandalas with your library."),
  ],
};

export default cross;
