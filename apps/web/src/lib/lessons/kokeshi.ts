import {
  between,
  connectedAndPrintable,
  extras,
  fail,
  findBody,
  findHead,
  findObi,
  floatingObjects,
  formatInches,
  holes,
  inches,
  isHollowed,
  mirroredPair,
  pass,
  solids,
  topObjects,
  touches,
  type Part,
} from "@/lib/lessons/sceneChecks";
import type { FigurePart, GhostPart, Lesson, LessonScene, LessonStep, StepCheck } from "@/lib/lessons/types";

/*
 * Kokeshi Maker: the lesson content. Sizes in the text are inches in fractions, as the editor shows
 * them (the doll is 6 to 8 in tall); the checks compare in millimetres, as the editor stores them,
 * and accept a range so every student's doll can be a little different. Students build every part
 * from basic shapes: nothing here places a shape for them. Front is +z, as the view cube's FRONT.
 */

/* ---------- sizes (inches) ---------- */

const BODY_W = 2.5;
const BODY_H = 4;
const HEAD_W = 2.625;
const SINK = 0.125;

/* ---------- the front-view pictures (inches) ---------- */

const HEAD_Y = BODY_H - SINK;
const BODY: FigurePart = { shape: "rect", x: 0, y: 0, w: BODY_W, h: BODY_H };
const HEAD: FigurePart = { shape: "ellipse", x: 0, y: HEAD_Y, w: HEAD_W, h: HEAD_W };
const BOB: FigurePart = { shape: "dome", x: 0, y: HEAD_Y + 0.5, w: 2.875, h: 2.25 };
const BANGS: FigurePart = { shape: "rect", x: 0, y: HEAD_Y + 0.5, w: 1.9, h: 1.25 };
const OBI: FigurePart = { shape: "rect", x: 0, y: 1.8, w: 2.75, h: 0.5 };
const done = (part: FigurePart): FigurePart => ({ ...part, state: "done" });
const added = (part: FigurePart): FigurePart => ({ ...part, state: "new" });
const hole = (part: FigurePart): FigurePart => ({ ...part, state: "hole" });
const DOLL = [done(BODY), done(HEAD)];
const DRESSED = [...DOLL, done(BOB), done(OBI)];

/* ---------- small check builders ---------- */

const PROPORTION_TIP = "To change the size without changing the shape, turn on Keep proportions in the shape's card (or hold Shift while you drag a corner handle), or use Scale by percent.";

/** The body, or before it is sized, the biggest shape standing on the workplane (so a size check can say how big it is now). */
const needBody = (then: (body: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => (scene) => {
  const body = findBody(scene)
    ?? solids(scene).filter((part) => part.box.minY < 1.5).sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d)[0];
  return body ? then(body, scene) : fail("Start with the body: drag a shape onto the workplane.");
};

const needHead = (then: (head: Part, body: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => needBody((body, scene) => {
  const head = findHead(scene);
  return head ? then(head, body, scene) : fail("Add the head: a Sphere at least 1 1/2 in across, above the body.");
});

/** Before it is sized and lifted: the biggest sphere that isn't the body, wherever it is. */
function anyHead(scene: LessonScene) {
  const body = findBody(scene);
  return solids(scene)
    .filter((part) => part !== body && (part.kind === "sphere" || part.kind === "ellipse"))
    .sort((a, b) => b.w - a.w)[0] ?? null;
}

const needAnyHead = (then: (head: Part, body: Part) => ReturnType<StepCheck>): StepCheck => needBody((body, scene) => {
  const head = anyHead(scene);
  return head ? then(head, body) : fail("Drag a Sphere onto the workplane for the head.");
});

/** The hair or helmet: the biggest dome or sphere that covers the top of the head. */
function findHair(scene: LessonScene) {
  const head = findHead(scene);
  if (!head) return null;
  return solids(scene)
    .filter((part) => part !== head && (part.kind === "halfSphere" || part.kind === "sphere" || part.kind === "ellipse" || part.kind === "paraboloid") && part.w >= head.w * 0.9 && part.box.maxY >= head.box.maxY - 1 && touches(part, head))
    .sort((a, b) => b.w - a.w)[0] ?? null;
}

const needHair = (then: (hair: Part, head: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => needHead((head, _body, scene) => {
  const hair = findHair(scene);
  return hair ? then(hair, head, scene) : fail("Cover the top of the head with a Half Sphere a little wider than the head.");
});

const centred = (a: Part, b: Part) => Math.abs(a.cx - b.cx) <= 0.8 && Math.abs(a.cz - b.cz) <= 0.8;

/** How many of `parts` share one size: what Pattern or Duplicate makes. */
function sameSizeCount(parts: Part[]) {
  const bySize = new Map<string, number>();
  for (const part of parts) {
    const key = [part.shape.width, part.shape.height, part.shape.depth].map((value) => Math.round(value)).join("x");
    bySize.set(key, (bySize.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...bySize.values());
}

/** Parts of about the same size, at least `count` of them, all touching `target`: what a pattern makes. */
const patternAround = (parts: Part[], target: Part, count: number) => sameSizeCount(parts.filter((part) => touches(part, target, 1))) >= count;

/** A part's own sizes, smallest first (not its box, which a turn changes). */
const ownSizes = (part: Part) => [part.shape.width ?? part.shape.size, part.shape.height, part.shape.depth ?? part.shape.size].sort((a, b) => a - b);

/** Small thin parts (an accessory's ribs or petals): thinnest side under `thin` in, longest under `long` in. */
const smallThin = (scene: LessonScene, thin: number, long: number) => solids(scene).filter((part) => {
  const sizes = ownSizes(part);
  return sizes[0] <= inches(thin) && sizes[2] <= inches(long);
});

/** Long and thin by its own size (not its box, which a tilt makes round). */
const elongated = (part: Part) => {
  const sizes = [part.shape.width, part.shape.height, part.shape.depth].sort((a, b) => a - b);
  return sizes[2] >= sizes[0] * 2.2;
};

const printable: StepCheck = connectedAndPrintable;

const allPartsWrapped = (scene: LessonScene) => solids(scene).some((part) => Boolean(part.shape.cylinderWrap));

/** A size check that says what the size is now and how to fix it without spoiling the shape. */
function sizeAdvice(what: string, measured: number, low: number, high: number, target: string, dimension: "tall" | "wide" | "across") {
  if (between(measured, inches(low), inches(high))) return null;
  const direction = measured < inches(low) ? "bigger" : "smaller";
  return fail(`Your ${what} is ${formatInches(measured)} ${dimension}. Aim for ${target}: make it ${direction}. ${PROPORTION_TIP}`);
}

/* ---------- the orange outlines on the build plate (mm) ---------- */

const ghostBody = (kind: GhostPart["kind"] = "cylinder", w = BODY_W, h = BODY_H): GhostPart[] => [{ kind, x: 0, z: 0, y: 0, w: inches(w), d: inches(w), h: inches(h) }];

const ghostHead = (scene: LessonScene): GhostPart[] | null => {
  const body = findBody(scene);
  if (!body) return null;
  return [{ kind: "sphere", x: body.cx, z: body.cz, y: body.box.maxY - inches(SINK), w: inches(HEAD_W), d: inches(HEAD_W), h: inches(HEAD_W) }];
};

const onHead = (scene: LessonScene, make: (head: Part) => GhostPart[]) => {
  const head = findHead(scene);
  return head ? make(head) : null;
};

const ghostBob = (scene: LessonScene) => onHead(scene, (head) => [{ kind: "sphere", x: head.cx, z: head.cz, y: head.box.minY - inches(0.6), w: head.w + inches(0.25), d: head.d + inches(0.25), h: head.h + inches(0.725) }]);

const ghostBangs = (scene: LessonScene) => onHead(scene, (head) => [{ kind: "box", hole: true, x: head.cx, z: head.cz + head.d / 2, y: head.box.minY + inches(0.4), w: inches(1.9), d: inches(1.2), h: inches(1.35) }]);

const ghostObi = (scene: LessonScene): GhostPart[] | null => {
  const body = findBody(scene);
  return body ? [{ kind: "cylinder", x: body.cx, z: body.cz, y: body.box.minY + body.h * 0.45, w: body.w + inches(0.25), d: body.d + inches(0.25), h: inches(0.5) }] : null;
};

/* ---------- welcome ---------- */

const welcome: LessonStep[] = [
  {
    id: "meet",
    title: "Meet the kokeshi",
    body: "Kokeshi are wooden dolls from the Tohoku region of northern Japan. Woodworkers who made bowls and trays began turning them on a lathe in the late Edo period, around 150 to 200 years ago, and sold them to visitors at the region's hot spring towns.",
    figure: { parts: DRESSED, caption: "A traditional kokeshi: a round body and a big round head." },
  },
  {
    id: "why",
    title: "Why they look the way they do",
    body: "A kokeshi has no arms or legs, just a round body and a big round head, because it was shaped on a spinning lathe. Each village had its own style of shape and painted pattern, often flowers, and makers passed their style down through families.\n\nToday artists also make creative kokeshi with new shapes and designs. That's what you'll do.",
  },
  {
    id: "plan",
    title: "Your choices",
    body: "You'll build your doll from simple shapes, one part at a time, and choose at each step:\n\nBody: cylinder, flat-bottomed sphere, or cone (pointed or rounded).\n\nHead: a sphere sized to fit your body.\n\nHair or helmet: a bob made from a half sphere or from a copy of the head, with a bun or pigtails if you like, or a samurai helmet.\n\nKimono: an obi for everyone, then sleeves, a sash with a bow, a collar, a flower pattern or a wrapped design.\n\nArmor (optional): chest plate, shoulder guards, skirt plates.\n\nFace: eyes, brows, mouth and cheeks.\n\nAccessories: fan, sword, umbrella, flower or hair ornament.\n\nThen you'll check it, bundle it in its print colours and print it.",
    figure: { parts: DRESSED, caption: "The parts you'll build, from the bottom up." },
  },
  {
    id: "name",
    title: "Name your design",
    body: "Click the design's name at the top of the screen (a new design is called something like \"Untitled design 1\") and rename it Kokeshi_ followed by your name, for example Kokeshi_Maya. Press Enter.",
    check: (scene) => (/^kokeshi_\S+/i.test((scene.projectName ?? "").trim()) ? pass() : fail("Rename the design Kokeshi_ followed by your name, for example Kokeshi_Maya.")),
    success: "Your teacher can find your design by its name.",
    hint: "The name box is in the middle of the top bar. Click it, type the new name, and press Enter.",
  },
  {
    id: "look",
    title: "Look around",
    body: "Right-drag to orbit around the workplane, scroll to zoom, and middle-drag to pan. Try each one now.\n\nThe house button next to the view cube brings the view back to the start whenever you get lost.",
  },
  {
    id: "undo",
    title: "Your undo button",
    body: "Mistakes are fine. Ctrl+Z (Cmd+Z on a Mac) takes one step back, and Ctrl+Y goes forward again.\n\nOrange outlines on the workplane show where each new part goes, like in Tinkercad's lessons.",
  },
];

/* ---------- body ---------- */

const measureBody: LessonStep = {
  id: "body-measure",
  title: "Measure your body",
  body: "Drag the Ruler from the shapes onto the workplane at a corner of your body. With the body selected, the ruler shows its width, length and height.\n\nYour body should be about 2 1/2 in wide and 4 in tall. If it isn't, click a number on the ruler and type the right one.",
  skill: "Measure",
  figure: { parts: [done(BODY), added({ shape: "line", x: 1.6, y: 0, w: 0, h: BODY_H })], caption: "4 in from the workplane to the top." },
  check: needBody((body) => sizeAdvice("body", body.h, 3.5, 4.5, "about 4 in", "tall") ?? sizeAdvice("body", body.w, 2, 3, "about 2 1/2 in", "wide") ?? pass()),
  success: "Just right. Your body is the size the rest of the lesson is built on.",
  hint: PROPORTION_TIP,
};

const bodyChoices = [
  {
    id: "cylinder",
    label: "Cylinder",
    blurb: "The classic straight body.",
    steps: [
      {
        id: "body-cylinder-place",
        title: "Place the cylinder",
        body: "Open the shapes and drag a Cylinder onto the orange outline in the middle of the workplane.",
        skill: "Place a shape",
        figure: { parts: [added(BODY)], caption: "The body stands in the middle of the workplane." },
        ghost: () => ghostBody(),
        check: (scene: LessonScene) => (solids(scene).some((part) => part.kind === "cylinder" && part.box.minY < 1.5) ? pass() : fail("Drag a Cylinder onto the workplane.")),
        hint: "Drag it, don't just click it, so it lands where you let go.",
      },
      {
        id: "body-cylinder-size",
        title: "Make it doll-sized",
        body: "Select the cylinder. Make it 2 1/2 in wide, 2 1/2 in long and 4 in tall: click each number on the shape and type the size.",
        skill: "Resize by typing",
        figure: { parts: [added(BODY)], caption: "2 1/2 in wide, 4 in tall." },
        ghost: () => ghostBody(),
        check: needBody((body) => sizeAdvice("body", body.w, 2, 3, "2 1/2 in", "wide") ?? sizeAdvice("body", body.h, 3.5, 4.5, "4 in", "tall") ?? pass()),
        hint: "In inches you can type fractions: two and a half can be typed as 2 1/2 or 2.5.",
      },
      measureBody,
    ],
  },
  {
    id: "sphere",
    label: "Flat-bottomed sphere",
    blurb: "A round body with its bottom cut flat.",
    steps: [
      {
        id: "body-sphere-place",
        title: "Place the sphere",
        body: "Drag a Sphere onto the orange outline. Make it 3 in wide, 3 in long and 4 1/2 in tall, so it is a tall egg.",
        skill: "Resize by typing",
        figure: { parts: [added({ shape: "ellipse", x: 0, y: -0.5, w: 3, h: 4.5 })], caption: "A tall egg; the bottom 1/2 in will be cut off." },
        ghost: () => ghostBody("sphere", 3, 4.5),
        check: (scene: LessonScene) => {
          const egg = solids(scene).filter((part) => part.kind === "sphere" || part.kind === "ellipse").sort((a, b) => b.h - a.h)[0];
          if (!egg) return fail("Drag a Sphere onto the workplane.");
          return sizeAdvice("sphere", egg.h, 4, 5, "4 1/2 in", "tall") ?? sizeAdvice("sphere", egg.w, 2.5, 3.5, "3 in", "wide") ?? pass();
        },
      },
      {
        id: "body-sphere-cut",
        title: "Cut the bottom flat",
        body: "Drag a Box onto the workplane and make it a Hole. Size it 4 x 4 in and 1/2 in tall. Select the hole and the sphere and use Align to centre them both ways. The hole now covers the bottom of the sphere.",
        skill: "Hole",
        figure: { parts: [done({ shape: "ellipse", x: 0, y: 0, w: 3, h: 4.5 }), hole({ shape: "rect", x: 0, y: 0, w: 4, h: 0.5 })], caption: "The grey box cuts off the round bottom." },
        ghost: (): GhostPart[] => [{ kind: "box", hole: true, x: 0, z: 0, y: 0, w: inches(4), d: inches(4), h: inches(0.5) }],
        check: (scene: LessonScene) => {
          const egg = solids(scene).filter((part) => part.kind === "sphere" || part.kind === "ellipse").sort((a, b) => b.h - a.h)[0];
          if (!egg) return fail("Place the sphere first.");
          const cutter = holes(scene).find((part) => touches(part, egg) && part.box.maxY < egg.cy && part.w >= egg.w * 0.9);
          if (!cutter) return fail("Add a Box Hole wider than the sphere across its bottom.");
          return centred(cutter, egg) ? pass() : fail("Select both and use Align to centre the hole under the sphere.");
        },
      },
      {
        id: "body-sphere-group",
        title: "Group and drop",
        body: "Select the sphere and the hole and press Group. Then use Drop to workplane (right-click the body) so the new flat bottom sits on the workplane.",
        skill: "Group",
        check: needBody((body, scene) => {
          const grouped = holes(scene).some((part) => part.topId === body.topId);
          if (!grouped) return fail("Select the sphere and the hole and press Group.");
          const bottom = Math.min(...solids(scene).filter((part) => part.topId === body.topId).map((part) => part.box.minY));
          return bottom < -inches(0.25) ? pass() : fail("Drop the body to the workplane so its flat cut sits on it.");
        }),
        success: "A flat bottom: your doll will stand up.",
      },
    ],
  },
  {
    id: "cone",
    label: "Cone or rounded cone",
    blurb: "Wide at the bottom, narrow at the top.",
    steps: [
      {
        id: "body-cone-place",
        title: "Place the cone",
        body: "For a pointed shape, drag a Cone onto the orange outline. For a softer, rounded shape, use a Curved Cone instead.",
        skill: "Place a shape",
        figure: { parts: [added({ shape: "taper", x: 0, y: 0, w: 2.75, h: 4.25, topW: 1.25 })] },
        ghost: () => ghostBody("cone", 2.75, 4.25),
        check: (scene: LessonScene) => (solids(scene).some((part) => (part.kind === "cone" || part.kind === "curvedCone" || part.kind === "paraboloid") && part.box.minY < 1.5) ? pass() : fail("Drag a Cone or Curved Cone onto the workplane.")),
      },
      {
        id: "body-cone-size",
        title: "Size and shape it",
        body: "Make it 2 3/4 in wide and long and 4 1/4 in tall. In the shape's card, set the top so it is about 1 1/4 in across, wide enough to hold the head. On a Curved Cone, drag the Bend slider to round the sides.",
        skill: "Resize by typing",
        figure: { parts: [added({ shape: "taper", x: 0, y: 0, w: 2.75, h: 4.25, topW: 1.25 })], caption: "2 3/4 in at the bottom, about 1 1/4 in at the top." },
        ghost: () => ghostBody("cone", 2.75, 4.25),
        check: needBody((body) => sizeAdvice("body", body.w, 2.25, 3.25, "2 3/4 in", "wide") ?? sizeAdvice("body", body.h, 3.5, 4.75, "4 1/4 in", "tall") ?? pass()),
        hint: "A cone with a sharp point leaves nothing for the head to sit on. Give it a flat top in its card.",
      },
      { ...measureBody, id: "body-cone-measure", body: "Drag the Ruler from the shapes onto the workplane at a corner of your body. With the body selected, the ruler shows its width, length and height.\n\nYour cone should be about 2 3/4 in wide and 4 1/4 in tall.", check: needBody((body) => sizeAdvice("body", body.h, 3.5, 4.75, "about 4 1/4 in", "tall") ?? sizeAdvice("body", body.w, 2.25, 3.25, "about 2 3/4 in", "wide") ?? pass()) },
    ],
  },
];

/* ---------- head ---------- */

const headSteps: LessonStep[] = [
  {
    id: "head-place",
    title: "Add the head",
    body: "Drag a Sphere onto the workplane next to the body.",
    skill: "Place a shape",
    figure: { parts: [done(BODY), added(HEAD)], caption: "The head goes on top of the body." },
    check: needAnyHead(() => pass()),
    hint: "It's fine if it lands beside the body. The next step moves it.",
  },
  {
    id: "head-align",
    title: "Align it first",
    body: "Select the head and the body, open Align, and click the middle dots to centre them left to right and front to back. Then lift the head with the black arrow until it sits on top of the body.\n\nNow that it's on the body, you can see how big the head needs to be.",
    skill: "Align",
    figure: { parts: [done(BODY), added(HEAD)] },
    ghost: ghostHead,
    check: needAnyHead((head, body) => {
      if (!centred(head, body)) return fail("Centre the head over the body with Align: click the middle dot for both directions.");
      if (head.box.minY < body.box.maxY - inches(0.5)) return fail("Lift the head with the black arrow on top of it until it sits on top of the body.");
      if (head.box.minY > body.box.maxY + inches(0.25)) return fail(`The head floats ${formatInches(head.box.minY - body.box.maxY)} above the body. Lower it until it sits on top.`);
      return pass();
    }),
    hint: "Hold Shift and click both shapes to select them, then press Align (or L).",
  },
  {
    id: "head-size",
    title: "Size the head to fit",
    body: "Kokeshi heads are big. Turn on Keep proportions in the sphere's card so it stays round, then make it about 2 5/8 in across. It should look a little wider than the body.\n\nResizing moves its centre, so select head and body and Align them again.",
    skill: "Resize without losing proportion",
    figure: { parts: [done(BODY), added(HEAD)], caption: "About 2 5/8 in: a little wider than the body." },
    ghost: ghostHead,
    check: needAnyHead((head, body) => {
      const advice = sizeAdvice("head", head.w, 2.375, 3.25, "about 2 5/8 in", "across");
      if (advice) return advice;
      if (Math.abs(head.w - head.h) > inches(0.2) || Math.abs(head.w - head.d) > inches(0.2)) return fail(`Your head is ${formatInches(head.w)} wide but ${formatInches(head.h)} tall: it is no longer round. ${PROPORTION_TIP}`);
      return centred(head, body) ? pass() : fail("Align the head and body again: resizing moved the head's centre.");
    }),
    hint: PROPORTION_TIP,
  },
  {
    id: "head-sink",
    title: "Sink it in a little",
    body: "Lower the head until about 1/8 in of it goes into the body. Overlapping parts print as one piece; a gap means the head falls off.",
    skill: "Position by typing",
    figure: { parts: [done(BODY), added(HEAD)], caption: "1/8 in of the head goes into the body." },
    ghost: ghostHead,
    check: needHead((head, body) => {
      const overlap = body.box.maxY - head.box.minY;
      if (overlap < inches(1 / 32)) return fail(`The head is ${formatInches(-overlap)} above the body. Lower it so it sinks about 1/8 in in.`);
      if (overlap > inches(0.375)) return fail(`The head sinks ${formatInches(overlap)} into the body. Raise it so only about 1/8 in is inside.`);
      return pass();
    }),
    hint: "Select the head and type its height above the workplane: the body's height minus 1/8 in (for a 4 in body, 3 7/8 in).",
  },
  {
    id: "head-group",
    title: "Join them",
    body: "Select the head and the body and press Group. They are the same colour (the wood), so grouping them is fine.",
    skill: "Group",
    check: needHead((head, body) => (head.topId === body.topId ? pass() : fail("Select both and press Group."))),
    success: "Head and body are one object now.",
  },
];

/* ---------- hair ---------- */

const HAIR_EXTRA = 0.25;

/** The hole that hollows the hair: a copy of the head made a Hole, about the head's size. */
const headHole = (scene: LessonScene, head: Part) => holes(scene).find((part) => (part.kind === "sphere" || part.kind === "ellipse") && Math.abs(part.w - head.w) <= inches(0.2) && touches(part, head));

/** Thin Wedge holes along the edge of the bangs cut wisps of hair. */
function featherStep(id: string): LessonStep {
  return {
    id,
    title: "Feather the bangs",
    body: "Drag a Wedge (the triangle shape) and make it a Hole. Make it very thin, 1/32 in wide (or 1/64 in for finer wisps), and about 3/8 in tall. Turn it point up and place it along the bottom edge of the bangs so it cuts a thin wisp. Duplicate it (Ctrl+D) and move each copy a little along the edge for a feathered look.",
    skill: "Duplicate",
    figure: { parts: [...DOLL, done(BOB), hole(BANGS), ...[-0.6, -0.3, 0, 0.3, 0.6].map((x) => hole({ shape: "tri", x, y: HEAD_Y + 1.55, w: 0.08, h: 0.375 }))], caption: "Thin wedge holes cut wisps into the bangs." },
    check: needHair((hair, _head, scene) => (holes(scene).some((part) => part.kind === "wedge" && touches(part, hair, 1)) ? pass() : fail("Add a thin Wedge Hole along the edge of the bangs."))),
    hint: "So thin a wedge is hard to grab: type its size in the shape's card instead of dragging handles.",
  };
}

/* The bob the poster teaches: a copy of the head, a little bigger, stretched down and hollowed by
   another copy of the head made a Hole. */
const bobSteps: LessonStep[] = [
  {
    id: "bob-place",
    title: "Copy the head for the hair",
    body: "Select the head and press Ctrl+D to duplicate it. With Keep proportions on, make the copy 1/4 in bigger than the head (a 2 5/8 in head gets a 2 7/8 in copy). Then select the copy and the head and Align their centres every way. This copy becomes the hair.",
    skill: "Duplicate",
    figure: { parts: [...DOLL, added({ shape: "ellipse", x: 0, y: HEAD_Y - 0.125, w: HEAD_W + 0.25, h: HEAD_W + 0.25 })], caption: "The copy is 1/4 in bigger and wraps the head." },
    ghost: (scene) => onHead(scene, (head) => [{ kind: "sphere", x: head.cx, z: head.cz, y: head.box.minY - inches(HAIR_EXTRA / 2), w: head.w + inches(HAIR_EXTRA), d: head.d + inches(HAIR_EXTRA), h: head.h + inches(HAIR_EXTRA) }]),
    check: needHair((hair, head) => {
      const extra = hair.w - head.w;
      if (extra < inches(0.125)) return fail(`The copy is ${formatInches(hair.w)} across, only ${formatInches(Math.max(0, extra))} bigger than the head. Make it about 1/4 in bigger. ${PROPORTION_TIP}`);
      if (extra > inches(0.5)) return fail(`The copy is ${formatInches(hair.w)} across, ${formatInches(extra)} bigger than the head. Make it about 1/4 in bigger. ${PROPORTION_TIP}`);
      return centred(hair, head) ? pass() : fail("Select the copy and the head and Align their centres.");
    }),
    hint: "Ctrl+D (Cmd+D on a Mac) makes a copy in the same place.",
  },
  {
    id: "bob-lengthen",
    title: "Stretch the hair down",
    body: "A bob is longer at the sides and back than at the front. Drag the hair's bottom handle down (or type a bigger height) to stretch it to the length you want, at least down to the chin. The top stays where it is.",
    skill: "Resize on one axis",
    figure: { parts: [...DOLL, added(BOB)], caption: "The hair now reaches down to the jaw." },
    ghost: ghostBob,
    check: needHair((hair, head) => {
      if (hair.h < hair.w + inches(0.375)) return fail(`The hair is ${formatInches(hair.w)} wide and ${formatInches(hair.h)} tall. Stretch only its height, downward, until it is at least 3/8 in taller than it is wide.`);
      if (hair.box.minY > head.cy - inches(0.5)) return fail(`The hair ends ${formatInches(hair.box.minY - head.box.minY)} above the bottom of the head. Stretch it further down, at least to the chin.`);
      if (hair.box.maxY < head.box.maxY) return fail("Keep the top of the hair above the top of the head.");
      return pass();
    }),
    hint: "Stretch only the height: don't turn on Keep proportions for this one.",
  },
  {
    id: "bob-bangs",
    title: "Cut the bangs",
    body: "Drag a Box onto the workplane and make it a Hole. Make it 1 7/8 in wide, 1 1/4 in deep and 1 3/8 in tall. Move it to the front of the face (on the grey outline) so its top is at eyebrow height. It will cut the face free and leave the bangs above.",
    skill: "Hole",
    figure: { parts: [...DOLL, done(BOB), hole(BANGS)], caption: "The grey box cuts the hair away from the face." },
    ghost: ghostBangs,
    check: needHair((hair, head, scene) => (holes(scene).some((part) => part.kind === "box" && touches(part, hair) && part.cz > head.cz) ? pass() : fail("Add a Box Hole at the front of the hair, over the face."))),
    hint: "The front of the doll faces the FRONT side of the view cube.",
  },
  featherStep("bob-feather"),
  {
    id: "bob-hollow",
    title: "Hollow the hair",
    body: "Select the head and duplicate it again (Ctrl+D). Make this copy a Hole. Leave it the head's size and Align it to the head's centre, so it sits inside the hair. When you group, it scoops the inside of the hair out, so the hair fits over the head like a wig.",
    skill: "Hole",
    figure: { parts: [...DOLL, done(BOB), hole(HEAD)], caption: "A head-sized hole inside the hair." },
    ghost: (scene) => onHead(scene, (head) => [{ kind: "sphere", hole: true, x: head.cx, z: head.cz, y: head.box.minY, w: head.w, d: head.d, h: head.h }]),
    check: needHair((_hair, head, scene) => {
      const scoop = headHole(scene, head);
      if (!scoop) return fail("Duplicate the head and make the copy a Hole, the same size as the head.");
      return centred(scoop, head) && Math.abs(scoop.cy - head.cy) <= 1 ? pass() : fail("Align the hole to the head's centre every way.");
    }),
  },
  {
    id: "bob-fit",
    title: "Fit it to the head",
    body: "Look at the doll from the front and the side. Use the hair's card (its width, length and height) to make the hair hug the head with no big gap, about 1/8 in bigger than the head on each side.",
    skill: "Properties panel",
    check: needHair((hair, head) => (touches(hair, head) && hair.w <= head.w + inches(0.6) ? pass() : fail(`The hair is ${formatInches(hair.w)} across and the head ${formatInches(head.w)}. Keep the hair no more than about 1/4 in bigger on each side.`))),
  },
  {
    id: "bob-group",
    title: "Align and group the hair",
    body: "Select the hair and all its holes (the bangs box, the wedges and the head-sized hole), but not the head itself. Align them to the head's centre left to right, then press Group. The holes cut the hair: bangs at the front, hollow inside.",
    skill: "Group",
    check: needHair((hair, head, scene) => {
      const grouped = holes(scene).filter((part) => part.topId === hair.topId);
      if (!grouped.length) return fail("Select the hair and its holes and press Group.");
      if (head.topId === hair.topId) return fail("The head is in the hair's group. Undo, and select only the hair and its holes.");
      return pass();
    }),
    success: "A bob: longer at the back and sides, bangs at the front, hollow inside.",
  },
];

/* The bob from a Half Sphere: lengthened, hollowed with Hollow, bangs cut and feathered, then
   fitted with the half sphere's card. */
const halfBobSteps: LessonStep[] = [
  {
    id: "hbob-place",
    title: "Start the hair",
    body: "Drag a Half Sphere onto the workplane. Make it 2 7/8 in wide and long, a little wider than the head. Select it and the head and Align their centres both ways, then lift it onto the top of the head.",
    skill: "Align",
    figure: { parts: [...DOLL, added({ shape: "dome", x: 0, y: HEAD_Y + HEAD_W / 2, w: 2.875, h: 1.44 })] },
    ghost: (scene) => onHead(scene, (head) => [{ kind: "halfSphere", x: head.cx, z: head.cz, y: head.cy, w: head.w + inches(0.25), d: head.d + inches(0.25), h: inches(1.44) }]),
    check: needHair((hair, head) => (centred(hair, head) ? pass() : fail("Align the half sphere to the centre of the head."))),
  },
  {
    id: "hbob-lengthen",
    title: "Lengthen it into a bob",
    body: "A bob is longer at the sides and back than at the front. Lower the half sphere until its bottom edge is about 1/2 in above where the head meets the body. Then make it taller, about 2 1/4 in, until it covers the top of the head again.",
    skill: "Resize on one axis",
    figure: { parts: [...DOLL, added(BOB)], caption: "The hair now reaches down to the jaw." },
    ghost: (scene) => onHead(scene, (head) => [{ kind: "halfSphere", x: head.cx, z: head.cz, y: head.box.minY + inches(0.5), w: head.w + inches(0.25), d: head.d + inches(0.25), h: head.box.maxY + inches(0.125) - (head.box.minY + inches(0.5)) }]),
    check: needHair((hair, head) => {
      if (hair.box.minY > head.cy - inches(0.5)) return fail(`The hair ends ${formatInches(hair.box.minY - head.box.minY)} above the bottom of the head. Lower it and make it taller so it reaches about 1/2 in from the bottom.`);
      if (hair.box.maxY < head.box.maxY) return fail("Make the hair taller so it covers the top of the head.");
      return pass();
    }),
  },
  {
    id: "hbob-hollow",
    title: "Hollow the hair",
    body: "With the half sphere selected, use Hollow (in Edges & Walls). Give it a wall of 1/8 in and leave the bottom open. Now the hair is a shell that fits over the head instead of a solid block.",
    skill: "Hollow",
    figure: { parts: [...DOLL, added(BOB)] },
    check: needHair((hair) => (isHollowed(hair) ? pass() : fail("Select the half sphere and use Hollow with a 1/8 in wall, open at the bottom."))),
    didYouKnow: "Hollow keeps an even wall all the way round, so the hair has the same thickness everywhere.",
  },
  { ...bobSteps.find((entry) => entry.id === "bob-bangs")!, id: "hbob-bangs" },
  featherStep("hbob-feather"),
  {
    id: "hbob-fit",
    title: "Fit it to the head",
    body: "Look at the doll from the front and the side. Use the half sphere's card (its width, length, height and Steps) to make the hair hug the head with no gap between hair and head.",
    skill: "Properties panel",
    check: needHair((hair, head) => (touches(hair, head) && hair.w <= head.w + inches(0.6) ? pass() : fail(`The hair is ${formatInches(hair.w)} across and the head ${formatInches(head.w)}. Make it touch the head all round and no more than about 1/4 in wider on each side.`))),
  },
  {
    id: "hbob-group",
    title: "Align and group",
    body: "Select the hair and all its holes (the bangs box and the wedges), but not the head. Align them to the head's centre left to right, then press Group. The holes cut the hair.",
    skill: "Group",
    check: needHair((hair, head, scene) => {
      if (!holes(scene).some((part) => part.topId === hair.topId)) return fail("Select the hair and its holes and press Group.");
      return head.topId === hair.topId ? fail("The head is in the hair's group. Undo, and select only the hair and its holes.") : pass();
    }),
    success: "A bob: longer at the back and sides, bangs at the front.",
  },
];

const bunStep: LessonStep = {
  id: "bun",
  title: "Add the bun",
  body: "Put a Sphere about 7/8 in across on top of the hair. Align it to the head's centre both ways, then lower it a little into the hair.",
  skill: "Align",
  figure: { parts: [...DOLL, done(BOB), added({ shape: "ellipse", x: 0, y: HEAD_Y + HEAD_W - 0.1, w: 0.875, h: 0.875 })] },
  ghost: (scene) => onHead(scene, (head) => [{ kind: "sphere", x: head.cx, z: head.cz, y: head.box.maxY - inches(0.1), w: inches(0.875), d: inches(0.875), h: inches(0.875) }]),
  check: needHair((hair, head, scene) => {
    const bun = solids(scene).find((part) => part !== hair && part !== head && between(part.w, inches(0.5), inches(1.3)) && part.cy > head.box.maxY - inches(0.2) && touches(part, hair));
    if (!bun) return fail("Add a sphere 1/2 to 1 1/4 in across on top of the hair, touching it.");
    return centred(bun, head) ? pass() : fail("Align the bun to the centre of the head.");
  }),
  didYouKnow: "A thin Torus around the bun makes a hair tie.",
};

const pigtailSteps: LessonStep[] = [
  {
    id: "pigtail-one",
    title: "One pigtail",
    body: "Stretch a Sphere into an egg (about 3/4 x 3/4 x 1 3/8 in) and place it against one side of the hair. Turn it about 20 degrees so it hangs outward.",
    skill: "Rotate",
    figure: { parts: [...DOLL, done(BOB), added({ shape: "ellipse", x: -1.6, y: HEAD_Y + 0.6, w: 0.75, h: 1.375, tilt: 20 })] },
    ghost: (scene) => onHead(scene, (head) => [{ kind: "sphere", x: head.cx - inches(1.6), z: head.cz, y: head.box.minY + inches(0.6), w: inches(0.75), d: inches(0.75), h: inches(1.375) }]),
    check: needHair((hair, head, scene) => (extras(scene).some((part) => part !== hair && touches(part, hair) && Math.abs(part.cx - head.cx) > head.w * 0.35) ? pass() : fail("Place a pigtail on one side of the hair, touching it."))),
  },
  {
    id: "pigtail-mirror",
    title: "Mirror the other",
    body: "Duplicate the pigtail (Ctrl+D), use Mirror to flip it left to right, and move it to the other side. Then select both pigtails and the head and Align them top to bottom so they match.",
    skill: "Mirror",
    figure: { parts: [...DOLL, done(BOB), done({ shape: "ellipse", x: -1.6, y: HEAD_Y + 0.6, w: 0.75, h: 1.375, tilt: 20 }), added({ shape: "ellipse", x: 1.6, y: HEAD_Y + 0.6, w: 0.75, h: 1.375, tilt: -20 })] },
    check: needHair((hair, head, scene) => (mirroredPair(extras(scene).filter((part) => part !== hair && touches(part, hair)), head.cx, 1.5) ? pass() : fail("Make the two pigtails the same size and the same distance from the middle."))),
    didYouKnow: "Mirror guarantees both sides match exactly. Placing by hand never quite does.",
  },
];

const HELMET: FigurePart = { shape: "dome", x: 0, y: HEAD_Y + 1.25, w: 2.9, h: 1.45 };
const BRIM: FigurePart = { shape: "rect", x: 0, y: HEAD_Y + 1.2, w: 3.4, h: 0.15 };

const helmetSteps: LessonStep[] = [
  {
    id: "helmet-bowl",
    title: "The helmet bowl",
    body: "Drag a Half Sphere about 2 7/8 in across onto the workplane. Align it to the head's centre both ways and lift it so it sits over the top half of the head like a bowl.",
    skill: "Align",
    figure: { parts: [...DOLL, added(HELMET)] },
    ghost: (scene) => onHead(scene, (head) => [{ kind: "halfSphere", x: head.cx, z: head.cz, y: head.cy - inches(0.1), w: inches(2.875), d: inches(2.875), h: inches(1.45) }]),
    check: needHair((helmet, head) => (centred(helmet, head) ? pass() : fail("Align the helmet to the centre of the head."))),
  },
  {
    id: "helmet-brim",
    title: "The brim",
    body: "A Cylinder 3 3/8 in across and 1/8 in thick goes around the bottom of the bowl. Align it to the bowl's centre.",
    skill: "Resize by typing",
    figure: { parts: [...DOLL, done(HELMET), added(BRIM)] },
    ghost: (scene) => onHead(scene, (head) => [{ kind: "cylinder", x: head.cx, z: head.cz, y: head.cy - inches(0.15), w: inches(3.375), d: inches(3.375), h: inches(0.125) }]),
    check: needHair((helmet, _head, scene) => {
      const brim = solids(scene).find((part) => part !== helmet && part.w > helmet.w && part.h < inches(0.45) && touches(part, helmet));
      if (!brim) return fail("Add a flat Cylinder brim wider than the helmet, touching it.");
      return centred(brim, helmet) ? pass() : fail("Align the brim to the centre of the helmet.");
    }),
  },
  {
    id: "helmet-crest",
    title: "The crest",
    body: "Stand a Crescent up on the front of the helmet, about 1 3/4 in wide. Turn it so its points face up, like horns, and Align it to the middle left to right.",
    skill: "Rotate",
    figure: { parts: [...DOLL, done(HELMET), done(BRIM), added({ shape: "crescent", x: 0, y: HEAD_Y + 2.4, w: 1.75, h: 0.9 })] },
    check: needHair((helmet, _head, scene) => (solids(scene).some((part) => part.kind === "crescent" && touches(part, helmet)) ? pass() : fail("Add a Crescent touching the front of the helmet."))),
    didYouKnow: "A samurai helmet's crest showed who the wearer was.",
  },
  {
    id: "helmet-guards",
    title: "Neck guards",
    body: "Put a Wedge on one side at the back of the helmet as a neck guard. Duplicate it, Mirror it, and move it to the other side.",
    skill: "Mirror",
    check: needHair((helmet, head, scene) => (mirroredPair(solids(scene).filter((part) => part.kind === "wedge" && touches(part, helmet, 1)), head.cx, 1.5) ? pass() : fail("Add two matching Wedges, one each side, touching the helmet."))),
  },
];

/* ---------- kimono ---------- */

const SLEEVE_L: FigurePart = { shape: "ellipse", x: -0.95, y: 1.6, w: 0.9, h: 2.6, tilt: -25 };
const SLEEVE_R: FigurePart = { ...SLEEVE_L, x: 0.95, tilt: 25 };

const sleeveSteps: LessonStep[] = [
  {
    id: "sleeve-one",
    title: "One sleeve",
    body: "Kimono sleeves sweep down from the shoulders and meet in front. Stretch a Sphere into a long egg (about 7/8 x 7/8 x 3 in). Turn it twice: once to slant it toward the front, once to lean it in toward the middle, so it runs from the shoulder down to the front of the body.",
    skill: "Rotate on two axes",
    figure: { parts: [...DRESSED, added(SLEEVE_L)], caption: "Seen from the front: the sleeve slants in toward the middle." },
    check: needBody((body, scene) => (extras(scene).some((part) => elongated(part) && touches(part, body)) ? pass() : fail("Add a long stretched shape touching the side of the body."))),
    hint: "Use the curved arrows around a selected shape to turn it.",
  },
  {
    id: "sleeve-mirror",
    title: "Mirror the other sleeve",
    body: "Duplicate the sleeve, Mirror it left to right, and place it on the other shoulder so the two sleeve ends meet in front. Align both sleeves top to bottom so they match.",
    skill: "Mirror",
    figure: { parts: [...DRESSED, done(SLEEVE_L), added(SLEEVE_R)] },
    check: needBody((body, scene) => (mirroredPair(extras(scene).filter((part) => elongated(part) && touches(part, body)), body.cx, 2) ? pass() : fail("Make the second sleeve a mirror image of the first."))),
  },
  {
    id: "sleeve-hands",
    title: "Hidden or cupped hands?",
    body: "Hidden hands: slide the sleeve ends together until they overlap in front, as if the hands are tucked inside.\n\nCupped hands: leave a small gap between the sleeve ends and put two small flattened Spheres (about 1/2 in) there as hands. Cut a little Half Sphere Hole into them to cup them.",
    skill: "Hole",
    figure: { parts: [...DRESSED, done(SLEEVE_L), done(SLEEVE_R), added({ shape: "ellipse", x: 0, y: 0.55, w: 0.5, h: 0.35 })] },
    check: printable,
    didYouKnow: "Long swinging sleeves, called furisode, were worn by young women for celebrations.",
  },
];

const sashSteps: LessonStep[] = [
  {
    id: "sash-cord",
    title: "The cord",
    body: "Wrap a thin cord around the middle of the obi: a Torus about 1/16 in thick, a little wider than the obi. Align it to the obi's centre.",
    skill: "Align",
    check: needBody((_body, scene) => {
      const obi = findObi(scene);
      if (!obi) return fail("Tie the obi first.");
      return extras(scene).some((part) => (part.kind === "torus" || part.kind === "cylinder" || part.kind === "tube" || part.kind === "ring") && touches(part, obi)) ? pass() : fail("Add a thin Torus around the obi.");
    }),
  },
  {
    id: "sash-bow",
    title: "The bow and tails",
    body: "At the back of the obi, build a bow: two Ellipses tilted outward (make the second with Mirror) and a small Sphere for the knot. Add two thin Boxes hanging down as the sash tails. Align the bow to the middle of the back.",
    skill: "Mirror",
    figure: { parts: [...DRESSED, added({ shape: "ellipse", x: -0.45, y: 1.9, w: 0.8, h: 0.5, tilt: -15 }), added({ shape: "ellipse", x: 0.45, y: 1.9, w: 0.8, h: 0.5, tilt: 15 }), added({ shape: "rect", x: -0.15, y: 0.9, w: 0.2, h: 1 }), added({ shape: "rect", x: 0.15, y: 0.9, w: 0.2, h: 1 })], caption: "Seen from the back." },
    check: needBody((body, scene) => {
      const obi = findObi(scene);
      if (!obi) return fail("Tie the obi first.");
      return mirroredPair(extras(scene).filter((part) => touches(part, obi, 1.5)), body.cx, 2) ? pass() : fail("Make the two bow loops mirror images, both touching the obi.");
    }),
  },
];

/* ---------- accessories ---------- */

const accessoryTouches = (what: string): StepCheck => (scene) => {
  const floating = floatingObjects(scene);
  if (floating.length) return fail(`${floating.length === 1 ? "A part" : `${floating.length} parts`} of the ${what} ${floating.length === 1 ? "is" : "are"} not touching the doll. Move ${floating.length === 1 ? "it" : "them"} until ${floating.length === 1 ? "it touches" : "they touch"}.`);
  return connectedAndPrintable(scene);
};

const fanSteps: LessonStep[] = [
  {
    id: "fan-leaf",
    title: "The fan leaf",
    body: "Drag a Cylinder and make it 2 in across and 1/16 in thick. Stand it up on its edge by turning it 90 degrees. Add a Box Hole over its bottom half and Group, so a half circle is left.",
    skill: "Hole",
    figure: { parts: [added({ shape: "dome", x: 0, y: 1, w: 2, h: 1 }), hole({ shape: "rect", x: 0, y: 0, w: 2.2, h: 1 })], caption: "A half circle, standing up." },
    check: (scene) => (solids(scene).some((part) => part.kind === "cylinder" && Math.min(part.shape.width, part.shape.depth, part.shape.height) < inches(0.15)) ? pass() : fail("Make a thin Cylinder, 1/16 in thick, standing on its edge.")),
  },
  {
    id: "fan-ribs",
    title: "Ribs",
    body: "Make one thin Box rib (1/16 x 1/16 x 1 in) from the bottom middle of the fan to its edge. Use Pattern, around a circle, with 7 copies spread over half a turn, so the ribs fan out.",
    skill: "Circular pattern",
    figure: { parts: [done({ shape: "dome", x: 0, y: 1, w: 2, h: 1 }), added({ shape: "rect", x: 0, y: 1, w: 0.06, h: 1, tilt: -60 }), added({ shape: "rect", x: 0, y: 1, w: 0.06, h: 1, tilt: -30 }), added({ shape: "rect", x: 0, y: 1, w: 0.06, h: 1 }), added({ shape: "rect", x: 0, y: 1, w: 0.06, h: 1, tilt: 30 }), added({ shape: "rect", x: 0, y: 1, w: 0.06, h: 1, tilt: 60 })] },
    check: (scene) => (sameSizeCount(smallThin(scene, 0.15, 1.25)) >= 5 ? pass() : fail("Make one thin Box rib and Pattern it into at least 5 matching ribs.")),
  },
  {
    id: "fan-hold",
    title: "Put it in the hands",
    body: "Group the fan, then move it so its bottom point rests where the sleeves meet (or against the body). Tilt it a little so it leans on the doll and doesn't stick out.",
    skill: "Group",
    check: accessoryTouches("fan"),
    success: "The fan touches the doll and is thick enough to print.",
  },
];

const swordSteps: LessonStep[] = [
  {
    id: "sword-blade",
    title: "The blade",
    body: "A Box 1/8 in wide, 1/16 in thick and 3 in long. Turn it a few degrees so it has a slight curve-like slant, like a katana.",
    skill: "Resize by typing",
    figure: { parts: [added({ shape: "rect", x: 0, y: 1.2, w: 0.125, h: 3, tilt: 4 })] },
    check: (scene) => (solids(scene).some((part) => elongated(part) && Math.max(part.shape.width, part.shape.depth, part.shape.height) >= inches(2)) ? pass() : fail("Make a long thin Box, about 3 in long.")),
  },
  {
    id: "sword-guard",
    title: "Guard and handle",
    body: "Add a flat Cylinder (1/2 in across, 1/16 in thick) where the blade ends as the guard, and a Cylinder 3/16 in across and 1 in long as the handle. Align all three to the blade's centre line and Group them.",
    skill: "Align",
    figure: { parts: [done({ shape: "rect", x: 0, y: 1.2, w: 0.125, h: 3 }), added({ shape: "ellipse", x: 0, y: 1.15, w: 0.5, h: 0.1 }), added({ shape: "rect", x: 0, y: 0.15, w: 0.19, h: 1 })], caption: "Blade, guard and handle on one line." },
    check: (scene) => {
      const blade = solids(scene).find((part) => elongated(part) && ownSizes(part)[2] >= inches(2) && ownSizes(part)[0] <= inches(0.25));
      if (!blade) return fail("Make the blade first: a long thin Box, about 3 in long.");
      const held = solids(scene).filter((part) => part !== blade && part.topId === blade.topId);
      if (held.length < 2) return fail("Add the guard and the handle, then select all three and Group them.");
      return pass();
    },
  },
  {
    id: "sword-lean",
    title: "Lean it on the doll",
    body: "Stand the sword on the workplane next to the doll and tilt it so it leans against the body or a sleeve, touching in two places.",
    skill: "Rotate",
    hint: "A sword that sticks out sideways snaps off when printed. Lean it on the body.",
    check: accessoryTouches("sword"),
    success: "The sword leans on the doll and will print standing up.",
  },
];

const umbrellaSteps: LessonStep[] = [
  {
    id: "umbrella-canopy",
    title: "The canopy",
    body: "A Half Sphere 3 in across and 1 in tall. Hollow it with a 1/16 in wall, open at the bottom.",
    skill: "Hollow",
    figure: { parts: [added({ shape: "dome", x: 0, y: 3, w: 3, h: 1 })] },
    check: (scene) => (solids(scene).some((part) => part.kind === "halfSphere" && isHollowed(part)) ? pass() : fail("Hollow a Half Sphere with a thin wall, open at the bottom.")),
  },
  {
    id: "umbrella-ribs",
    title: "Ribs and handle",
    body: "Add a thin Cylinder (1/8 in across, 3 1/4 in long) under the middle of the canopy as the handle, and a small Sphere on top as the tip. For ribs, make one thin Box under the canopy and Pattern it around the centre, 8 copies.",
    skill: "Circular pattern",
    figure: { parts: [done({ shape: "dome", x: 0, y: 3, w: 3, h: 1 }), added({ shape: "rect", x: 0, y: 0, w: 0.125, h: 3.25 }), added({ shape: "ellipse", x: 0, y: 3.95, w: 0.2, h: 0.2 })] },
    check: (scene) => {
      const canopy = solids(scene).find((part) => part.kind === "halfSphere" && isHollowed(part));
      if (!canopy) return fail("Make the hollow canopy first.");
      const handle = solids(scene).find((part) => part !== canopy && elongated(part) && ownSizes(part)[2] >= inches(2) && touches(part, canopy));
      return handle ? pass() : fail("Add a long thin Cylinder handle under the middle of the canopy, touching it.");
    },
  },
  {
    id: "umbrella-hold",
    title: "Over the shoulder",
    body: "Group the umbrella and tilt it so the handle rests in the hands or against the body, with the canopy behind the head. Make sure it touches the doll.",
    skill: "Rotate",
    check: accessoryTouches("umbrella"),
  },
];

const flowerSteps: LessonStep[] = [
  {
    id: "flower-petal",
    title: "One petal",
    body: "Stretch a Sphere into a flat petal: 3/8 in wide, 3/4 in long, 1/8 in thick. Place it so one end touches the middle of where the flower will be.",
    skill: "Resize on one axis",
    figure: { parts: [added({ shape: "ellipse", x: 0, y: 0.4, w: 0.375, h: 0.75 })] },
    check: (scene) => (smallThin(scene, 0.2, 1).some((part) => part.kind === "sphere" || part.kind === "ellipse") ? pass() : fail("Squash a Sphere into a petal: about 3/8 in wide, 3/4 in long and 1/8 in thick.")),
  },
  {
    id: "flower-pattern",
    title: "Five petals",
    body: "Use Pattern around a circle with 5 copies so the petals spread evenly. Add a small Sphere (1/4 in) in the middle as the centre and Group.",
    skill: "Circular pattern",
    figure: { parts: [added({ shape: "ellipse", x: 0, y: 0.4, w: 0.375, h: 0.75 }), added({ shape: "ellipse", x: 0.38, y: 0.12, w: 0.375, h: 0.75, tilt: 72 }), added({ shape: "ellipse", x: -0.38, y: 0.12, w: 0.375, h: 0.75, tilt: -72 }), added({ shape: "ellipse", x: 0.24, y: -0.35, w: 0.375, h: 0.75, tilt: 144 }), added({ shape: "ellipse", x: -0.24, y: -0.35, w: 0.375, h: 0.75, tilt: -144 }), done({ shape: "ellipse", x: 0, y: 0.25, w: 0.25, h: 0.25 })], caption: "Pattern spaces the petals evenly." },
    check: (scene) => (sameSizeCount(smallThin(scene, 0.2, 1).filter((part) => part.kind === "sphere" || part.kind === "ellipse")) >= 5 ? pass() : fail("Pattern the petal around a circle so there are 5 matching petals.")),
  },
  {
    id: "flower-place",
    title: "Hold or wear it",
    body: "Place the flower in the hands where the sleeves meet, or in the hair beside the bangs. It must touch the doll.",
    check: accessoryTouches("flower"),
  },
];

const ornamentSteps: LessonStep[] = [
  {
    id: "ornament-pin",
    title: "A hair pin",
    body: "A thin Cylinder (1/8 in across, 1 1/2 in long) with a small Sphere (1/4 in) on one end. Group them.",
    skill: "Group",
    figure: { parts: [added({ shape: "rect", x: 0, y: 0, w: 0.125, h: 1.5, tilt: 30 }), added({ shape: "ellipse", x: 0.4, y: 1.2, w: 0.25, h: 0.25 })] },
    check: (scene) => {
      const pin = solids(scene).find((part) => part.kind === "cylinder" && elongated(part) && ownSizes(part)[0] <= inches(0.25) && ownSizes(part)[2] >= inches(1));
      if (!pin) return fail("Make a thin Cylinder pin, 1/8 in across and 1 1/2 in long.");
      const bead = solids(scene).find((part) => part !== pin && (part.kind === "sphere" || part.kind === "ellipse") && part.w <= inches(0.5) && touches(part, pin));
      if (!bead) return fail("Put a small Sphere (1/4 in) on one end of the pin.");
      return bead.topId === pin.topId ? pass() : fail("Select the pin and the bead and Group them.");
    },
  },
  {
    id: "ornament-place",
    title: "Into the hair",
    body: "Push the pin into the side of the hair at an angle so about half of it is inside the hair. Add a second pin with Duplicate and Mirror if you like.",
    skill: "Rotate",
    check: accessoryTouches("hair pin"),
  },
];

/* ---------- the lesson ---------- */

const kokeshi: Lesson = {
  id: "kokeshi",
  title: "Kokeshi Maker",
  subtitle: "Design and 3D print your own kokeshi doll",
  units: "Imperial",
  sections: [
    { id: "welcome", title: "Welcome", goal: "Learn what a kokeshi is, see your choices, and name your design.", skills: [], steps: welcome, guidedOnly: true },
    {
      id: "body",
      title: "Body",
      goal: "Give your doll a body about 2 1/2 in wide and 4 in tall, standing on the workplane.",
      skills: ["Place a shape", "Resize by typing", "Hole", "Group", "Measure"],
      choices: bodyChoices,
      ownWayChecks: [
        { label: "A body at least 1 1/2 in tall stands on the workplane", check: (scene) => (findBody(scene) ? pass() : fail("Make a body at least 1 1/2 in tall, standing on the workplane.")) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "head",
      title: "Head",
      goal: "Put a big round head on the body, centred and joined to it.",
      skills: ["Align", "Resize without losing proportion", "Group"],
      steps: headSteps,
      ownWayChecks: [
        { label: "A round head sits on the body", check: needHead((head, body) => (touches(head, body) ? pass() : fail("The head must touch the body."))) },
        { label: "It is centred over the body", check: needHead((head, body) => (centred(head, body) ? pass() : fail("Use Align to centre it."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "hair",
      title: "Hair or helmet",
      goal: "Give your doll hair or a helmet that covers the top of the head.",
      skills: ["Align", "Resize on one axis", "Hollow", "Hole", "Group", "Mirror", "Rotate"],
      multi: true,
      choices: [
        { id: "bob-half", label: "Bob from a Half Sphere", blurb: "Lengthen a half sphere, Hollow it, cut and feather bangs.", steps: halfBobSteps },
        { id: "bob", label: "Bob from a copy of the head", blurb: "Copy the head 1/4 in bigger, stretch it, hollow it with a head-sized hole.", steps: bobSteps },
        { id: "bun", label: "Add a bun", blurb: "A bun on top of your bob. Pick a bob too.", steps: [bunStep] },
        { id: "pigtails", label: "Add pigtails", blurb: "Two matching tails on your bob. Pick a bob too.", steps: pigtailSteps },
        { id: "helmet", label: "Helmet", blurb: "A samurai-style helmet with a crest, instead of hair.", steps: helmetSteps },
      ],
      ownWayChecks: [
        { label: "Hair or a helmet covers the top of the head", check: needHair(() => pass()) },
        { label: "It is centred on the head", check: needHair((hair, head) => (centred(hair, head) ? pass() : fail("Use Align to centre it."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "kimono",
      title: "Kimono",
      goal: "Tie an obi around the body, then add sleeves, a sash or details.",
      skills: ["Hole", "Align", "Resize on one axis", "Rotate on two axes", "Mirror", "Circular pattern", "Wrap around a cylinder"],
      steps: [{
        id: "obi",
        title: "Tie the obi",
        body: "Make a ring: a Cylinder 2 3/4 in across and 1/2 in tall, and a Cylinder Hole the same height and 2 1/2 in across (the body's width). Align them and Group. Then slide the ring around the middle of the body on the orange outline and Align it to the body's centre.",
        skill: "Hole",
        figure: { parts: [...DOLL, done(BOB), added(OBI)] },
        ghost: ghostObi,
        check: needBody((body, scene) => {
          const obi = findObi(scene);
          if (!obi) return fail("Add a band 1/4 to 3/4 in tall around the middle of the body, a little wider than the body.");
          return centred(obi, body) ? pass() : fail("Align the obi to the body's centre.");
        }),
        success: "The obi is the wide sash that ties a kimono.",
      }],
      multi: true,
      choices: [
        { id: "sleeves", label: "Sleeves", blurb: "Sweeping sleeves meeting in front.", steps: sleeveSteps },
        { id: "sash", label: "Sash", blurb: "A cord and a big bow at the back.", steps: sashSteps },
        {
          id: "collar",
          label: "Collar",
          blurb: "A V-shaped collar.",
          steps: [{
            id: "collar-v",
            title: "Collar",
            body: "Place a thin Wedge (1/8 in thick, 1 1/2 in long) on the front of the body, slanting in toward the middle. Duplicate it and Mirror it to make a V. Align the two so the V is centred.",
            skill: "Mirror",
            figure: { parts: [...DRESSED, added({ shape: "rect", x: -0.3, y: 2.6, w: 0.15, h: 1.3, tilt: -25 }), added({ shape: "rect", x: 0.3, y: 2.6, w: 0.15, h: 1.3, tilt: 25 })] },
            check: needBody((body, scene) => (mirroredPair(solids(scene).filter((part) => part.kind === "wedge" && touches(part, body)), body.cx, 1.5) ? pass() : fail("Add two matching Wedges in a V on the front of the body."))),
          }],
        },
        {
          id: "flowers",
          label: "Flower pattern",
          blurb: "A ring of flowers around the body.",
          steps: [{
            id: "flower-print",
            title: "Flower print",
            body: "Build one small flower: a Sphere for the centre and five stretched Spheres as petals, about 1/2 in across in all. Group it and place it on the body. Then use Pattern, around a circle, so 6 to 8 copies circle the body.",
            skill: "Circular pattern",
            check: needBody((body, scene) => (patternAround(extras(scene), body, 5) ? pass() : fail("Make at least 5 matching copies around the body with Pattern."))),
            didYouKnow: "Pattern places copies at exactly even spacing. Try 5, 6 and 8 to see which looks best.",
          }],
        },
        {
          id: "wrap",
          label: "Wrapped design",
          blurb: "Text or shapes wrapped around the body.",
          steps: [{
            id: "wrap-design",
            title: "Wrapped design",
            body: "Write a word or lay out a row of small shapes, then use Cylinder wrap to bend them around the body.",
            skill: "Wrap around a cylinder",
            check: (scene) => (allPartsWrapped(scene) ? pass() : fail("Select your word or shapes and use Cylinder wrap to bend them around the body.")),
          }],
        },
      ],
      after: [{
        id: "raised-engraved",
        title: "Raised or engraved?",
        body: "Keep your details raised, or turn them into Holes and group them with the body to engrave them about 1/32 in deep.",
        check: printable,
        hint: "Raised details print best at 1/16 in thick or more.",
      }],
      ownWayChecks: [
        { label: "An obi wraps the middle of the body", check: needBody((_body, scene) => (findObi(scene) ? pass() : fail("Add a band around the middle of the body."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "armor",
      title: "Armor",
      optional: true,
      goal: "Add armor: a chest plate, shoulder guards or skirt plates.",
      skills: ["Hollow", "Hole", "Mirror", "Pattern", "Fillet"],
      multi: true,
      choices: [
        {
          id: "chest",
          label: "Chest plate",
          blurb: "A curved plate on the chest.",
          steps: [{
            id: "chest-plate",
            title: "Chest plate",
            body: "Duplicate the body, Hollow it to a 1/16 in wall, then cut away everything but the front with a Box Hole and Group. Align it to the body's centre.",
            skill: "Hollow",
            check: (scene) => (solids(scene).some(isHollowed) ? pass() : fail("Hollow a copy of the body with a thin wall.")),
          }],
        },
        {
          id: "shoulders",
          label: "Shoulder guards",
          blurb: "A matching pair.",
          steps: [{
            id: "shoulder-guards",
            title: "Shoulder guards",
            body: "Flatten a Half Sphere (1 1/4 in across, 3/8 in tall) and place it on one shoulder. Duplicate and Mirror it for the other shoulder.",
            skill: "Mirror",
            check: needBody((body, scene) => (mirroredPair(extras(scene).filter((part) => part.kind === "halfSphere"), body.cx, 1.5) ? pass() : fail("Add two matching Half Spheres, one on each shoulder."))),
          }],
        },
        {
          id: "skirt",
          label: "Skirt plates",
          blurb: "Plates all the way round.",
          steps: [{
            id: "skirt-plates",
            title: "Skirt plates",
            body: "Make one small rounded plate (a Box 5/8 x 1/8 x 1 in) at the hip, round its edges with Fillet, then Pattern it around the body, 8 to 12 copies.",
            skill: "Circular pattern",
            check: needBody((body, scene) => (patternAround(extras(scene), body, 6) ? pass() : fail("Pattern at least 6 plates around the body."))),
          }],
        },
      ],
      ownWayChecks: [{ label: "It will print", check: printable }],
    },
    {
      id: "face",
      title: "Face",
      goal: "Give your doll eyes, brows and a mouth.",
      skills: ["Workplane on a face", "Mirror", "Working at small scale", "Measure"],
      steps: [
        {
          id: "face-workplane",
          title: "Find the face",
          body: "Use the Workplane tool and click the front of the head. New shapes now land on the face. (Click the workplane tool again on the grid to put it back later.)",
        },
        {
          id: "face-eyes",
          title: "Eyes",
          body: "Two small Ellipses, about 3/16 in wide and 1/8 in tall. Place one, then Duplicate and Mirror it. Select both eyes and the head and Align them to the middle left to right. Keep them raised, or make them Holes to engrave them.",
          skill: "Mirror",
          figure: { parts: [...DRESSED, added({ shape: "ellipse", x: -0.45, y: HEAD_Y + 1.15, w: 0.19, h: 0.125 }), added({ shape: "ellipse", x: 0.45, y: HEAD_Y + 1.15, w: 0.19, h: 0.125 })] },
          check: needHead((head, _body, scene) => (mirroredPair(allSmallOn(scene, head), head.cx, 1) ? pass() : fail("Add two matching eyes, the same distance from the middle of the face."))),
        },
        {
          id: "face-mouth",
          title: "Brows and mouth",
          body: "A thin Crescent for each brow (Mirror the second), and a small Crescent or Heart for the mouth, centred with Align.",
          skill: "Working at small scale",
          figure: { parts: [...DRESSED, done({ shape: "ellipse", x: -0.45, y: HEAD_Y + 1.15, w: 0.19, h: 0.125 }), done({ shape: "ellipse", x: 0.45, y: HEAD_Y + 1.15, w: 0.19, h: 0.125 }), added({ shape: "crescent", x: 0, y: HEAD_Y + 0.75, w: 0.35, h: 0.12 })] },
          check: needHead((head, _body, scene) => (allSmallOn(scene, head).some((part) => part.kind === "crescent" || part.kind === "heart") ? pass() : fail("Add a small Crescent or Heart on the face."))),
        },
        {
          id: "face-cheeks",
          title: "Cheeks (optional)",
          body: "Two tiny flattened Spheres, mirrored, make rosy cheeks.",
        },
        {
          id: "face-measure",
          title: "Measure the details",
          body: "Open the Tape measure and measure the smallest detail on the face. Nothing should be smaller than 1/32 in, or the printer can't make it.",
          skill: "Measure",
          check: needHead((head, _body, scene) => {
            const tiny = allSmallOn(scene, head).filter((part) => Math.min(part.w, part.h, part.d) < inches(1 / 32));
            return tiny.length ? fail(`${tiny.length === 1 ? "One detail is" : `${tiny.length} details are`} thinner than 1/32 in. Make ${tiny.length === 1 ? "it" : "them"} a little thicker.`) : pass();
          }),
          didYouKnow: "Most printers can't make details smaller than the nozzle, usually about 1/64 in (0.4 mm).",
        },
      ],
      ownWayChecks: [
        { label: "Small features are on the face", check: needHead((head, _body, scene) => (allSmallOn(scene, head).length >= 2 ? pass() : fail("Add at least two small features to the face."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "accessories",
      title: "Accessories",
      goal: "Give your doll something to hold or wear.",
      skills: ["Hole", "Circular pattern", "Hollow", "Rotate", "Align", "Group"],
      multi: true,
      choices: [
        { id: "fan", label: "Fan", blurb: "A folding fan in the hands.", steps: fanSteps },
        { id: "sword", label: "Sword", blurb: "A katana leaning on the body.", steps: swordSteps },
        { id: "umbrella", label: "Umbrella", blurb: "A parasol over the shoulder.", steps: umbrellaSteps },
        { id: "flower", label: "Flower", blurb: "A flower to hold or wear.", steps: flowerSteps },
        { id: "ornament", label: "Hair ornament", blurb: "A hair pin with a bead.", steps: ornamentSteps },
      ],
      ownWayChecks: [{ label: "It touches the doll and will print", check: printable }],
    },
    {
      id: "print",
      title: "Print prep",
      goal: "Check the doll, colour it in your filament colours, and bundle it for printing.",
      skills: ["Check for floating parts", "Measure", "Bundle", "Export"],
      guidedOnly: true,
      steps: [
        {
          id: "print-floating",
          title: "Find floating parts",
          body: "Every part must touch the doll, or it falls off the print. The check below tells you if anything is floating.",
          skill: "Check for floating parts",
          check: (scene) => {
            const floating = floatingObjects(scene);
            return floating.length ? fail(`${floating.length} part${floating.length === 1 ? " is" : "s are"} floating: ${floating.map((part) => part.shape.name).slice(0, 3).join(", ")}. Move ${floating.length === 1 ? "it" : "them"} until ${floating.length === 1 ? "it touches" : "they touch"} the doll.`) : pass();
          },
          success: "Everything is connected.",
        },
        {
          id: "print-flat",
          title: "Flat bottom",
          body: "The bottom of the doll must sit flat on the workplane. Select everything and use Drop to workplane if it doesn't.",
          check: (scene) => {
            const lowest = Math.min(...solids(scene).filter((part) => !holes(scene).some((cut) => cut.topId === part.topId)).map((part) => part.box.minY));
            return !Number.isFinite(lowest) || Math.abs(lowest) < 0.3 ? pass() : fail(`The doll's lowest point is ${formatInches(lowest)} above the workplane. Select everything and use Drop to workplane.`);
          },
        },
        {
          id: "print-size",
          title: "Measure the whole doll",
          body: "Select everything and drag the Ruler to a corner of the doll. It should be 6 to 8 in tall.\n\nToo short or too tall? Select everything and use Scale by percent, so every part grows or shrinks together and nothing changes shape.",
          skill: "Measure",
          check: (scene) => {
            const top = Math.max(...solids(scene).map((part) => part.box.maxY));
            if (between(top, inches(6), inches(8))) return pass(`Your doll is ${formatInches(top)} tall.`);
            const percent = Math.round((inches(7) / top) * 100);
            return fail(`Your doll is ${formatInches(top)} tall. Aim for 6 to 8 in: select everything and use Scale by percent at about ${percent} % to make it 7 in, without changing its shape.`);
          },
          success: "The right height for printing.",
        },
        {
          id: "print-colours",
          title: "Colour it to print",
          body: "Give each part the colour of the filament you want it printed in: hair black, body red, and so on. Select a part and pick its colour in the shape's card.\n\nThese colours tell your teacher which filament to use.",
          skill: "Colour",
          check: (scene) => (new Set(solids(scene).map((part) => part.shape.color.toLowerCase())).size >= 2 ? pass() : fail("Give the parts at least two different filament colours.")),
        },
        {
          id: "print-bundle",
          title: "Bundle everything",
          body: "Select everything (Ctrl+A) and press Bundle (Ctrl+B). A bundle holds the parts together but keeps each one in its own colour, so the colours come through to the printer.",
          skill: "Bundle",
          check: (scene) => {
            const objects = topObjects(scene).filter((part) => !part.hole);
            if (objects.length !== 1) return fail(`There are ${objects.length} separate objects. Select all (Ctrl+A) and press Bundle (Ctrl+B).`);
            return objects[0].shape.groupOperation === "bundle" ? pass() : fail("That's a group. Select it and use Bundle (Ctrl+B) instead, so each part keeps its colour.");
          },
          didYouKnow: "Group joins parts into one solid. Bundle only holds them together, so a multi-colour printer can print each part in its own filament.",
        },
        {
          id: "print-done",
          title: "Congratulations!",
          body: "You designed a kokeshi from scratch. Export it as 3MF (it keeps the colours) from the export menu. Your teacher can see your finished design in LayerLab.",
        },
      ],
    },
    {
      id: "freestyle",
      title: "Freestyle",
      optional: true,
      freestyle: true,
      goal: "Design without steps: a new kokeshi, a family of dolls, or more on yours.",
      skills: [],
      ownWayChecks: [{ label: "It will print", check: printable }],
    },
  ],
};

function allSmallOn(scene: LessonScene, head: Part) {
  return solids(scene).filter((part) => part !== head && Math.max(part.w, part.h, part.d) < inches(0.8) && touches(part, head, 0.8));
}

export default kokeshi;
