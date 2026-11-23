import { baseSize, bottomPieces, buildersStep, closingSections, nameStep, strokesStep, upperSections } from "@/lib/lessons/mandalaShared";
import type { Lesson, LessonChoice, LessonStep } from "@/lib/lessons/types";

/*
 * Traditional Mandala: a round mandala in five layers. The bottom layer is a scalloped outline
 * with a ring of petals and a centre circle drawn level with it, all as strokes; layers 2 to 4
 * are offset layers, each set in from the one below so it shows beside them; layer 5 is the
 * centre. The shape builders (mandalaMotifs.ts) draw every ring; mandalaShared.ts holds the steps
 * and checks it shares with Mandala Cross.
 */

const NAME = "mandala";
const WHAT = "Scalloped base";

const welcome: LessonStep[] = [
  {
    id: "mandala-meet",
    title: "What is a mandala?",
    body: "Mandala means \"circle\" in Sanskrit. Mandalas appear in Hindu and Buddhist art, in the rose windows of cathedrals, in Islamic tile patterns and in Navajo sand paintings. They are built around one centre point, and every ring repeats the same motif around that point.\n\nThat repeat is called radial symmetry. Flowers, snowflakes and sea urchins have it too.",
  },
  {
    id: "mandala-plan",
    title: "How you'll build it",
    body: "You'll build five layers, from the bottom up:\n\nLayer 1: a scalloped outline with a ring of petals and a centre circle inside it.\nLayer 2: an offset layer of all of it.\nLayer 3: an offset layer a step smaller.\nLayer 4: one more offset layer.\nLayer 5: the centre.\n\nThen you'll draw a motif of your own and save it to your library.",
  },
  strokesStep(NAME),
  buildersStep(NAME),
  nameStep(NAME, "Mandala"),
];

const petalStep = (choice: string, name: string, tip: string): LessonStep => ({
  id: `mandala-petals-${choice}`,
  title: `Add ${name.toLowerCase()} in the same layer`,
  skill: "Same layer",
  body: `Select the scalloped outline. In Shape builders choose ${name}, pick Same layer, and press Add to my design. The ring goes level with the outline, right in the middle.\n\n${tip}\n\nThe petals' tips should touch the scalloped line, and neighbouring petals should touch each other, so the whole layer holds together as one piece.`,
  check: bottomPieces(WHAT, 2, "Add a ring of petals level with the outline: select the outline, choose a petal builder, pick Same layer and add it."),
  success: "Outline and petals, in one layer.",
  hint: "If the ring landed on top, undo (Ctrl+Z), pick Same layer and add it again.",
});

const petalChoices: LessonChoice[] = [
  { id: "lotus", label: "Lotus petals", blurb: "Round at the bottom, pointed at the tip.", steps: [petalStep("lotus", "Lotus petals", "10 petals look like a flower. With the settings it starts with, the tips just reach the scalloped line.")] },
  { id: "teardrop", label: "Teardrops", blurb: "Pointed toward the middle, round on the outside.", steps: [petalStep("teardrop", "Teardrops", "Try 12. Change Starts from the middle and Length until the round ends touch the scalloped line.")] },
  { id: "leaf", label: "Leaves", blurb: "Pointed at both ends.", steps: [petalStep("leaf", "Leaves", "Try 8 wide leaves. Make Width bigger until neighbouring leaves touch.")] },
];

const bottomSteps: LessonStep[] = [
  {
    id: "mandala-base",
    title: "Layer 1: the scalloped outline",
    skill: "Shape builders",
    body: "Click an empty spot on the workplane so nothing is selected. Open Shape builders, choose Scalloped base and press Add to my design.\n\nIt is about 4 1/4 in across, drawn with a line about 1/16 in wide. Try 12 to 20 bumps on its edge.",
    check: baseSize(WHAT),
    success: "The outline of your mandala.",
    hint: "If something was selected, the outline goes on top of it. Press Esc or click empty space first, so it sits on the plate.",
  },
];

const centreCircleSteps: LessonStep[] = [
  {
    id: "mandala-centre-circle",
    title: "A centre circle in the same layer",
    skill: "Same layer",
    body: "Select the petals. Choose Centre circle, pick Same layer and add it. Change its Radius until the circle touches the inner ends of the petals (about 1/2 in for lotus petals).\n\nLayer 1 is done: outline, petals and centre circle, all lines, all touching.",
    check: bottomPieces(WHAT, 3, "Add a centre circle level with the petals, touching their inner ends."),
    success: "Layer 1 is done.",
  },
];

const mandala: Lesson = {
  id: "mandala",
  title: "Traditional Mandala",
  subtitle: "A round mandala in five layers",
  units: "Imperial",
  library: "mandala",
  freestyleText: "No steps here. Build a new mandala from your library, try a different number of petals, or design a set of coasters. Here is every skill you have used so far:",
  sections: [
    { id: "welcome", title: "Welcome", goal: "Learn what a mandala is and how you'll build it.", skills: [], steps: welcome, guidedOnly: true },
    {
      id: "layer-1",
      title: "Layer 1",
      goal: "A scalloped outline about 4 in across, with a ring of petals and a centre circle level with it, all drawn as lines that touch.",
      skills: ["Shape builders", "Same layer"],
      steps: bottomSteps,
      choices: petalChoices,
      after: centreCircleSteps,
      ownWayChecks: [
        { label: "A bottom layer 3 to 6 1/2 in across on the plate", check: baseSize(WHAT) },
        { label: "At least three pieces in it, centred", check: bottomPieces(WHAT, 3, "Add the petals and the centre circle level with the outline.") },
      ],
    },
    ...upperSections(NAME, WHAT),
    ...closingSections(NAME, "Make more mandalas with your library."),
  ],
};

export default mandala;
