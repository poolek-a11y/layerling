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
  mirroredPair,
  pass,
  solids,
  topObjects,
  touches,
  type Part,
} from "@/lib/lessons/sceneChecks";
import type { FigurePart, Lesson, LessonScene, LessonStep, StepCheck } from "@/lib/lessons/types";

/*
 * Kokeshi Maker: the lesson content. Sizes in the text are inches (the doll is 6 to 8 in tall);
 * the checks compare in millimetres, as the editor stores them, and accept a range so every
 * student's doll can be a little different. Students build every part from basic shapes:
 * nothing here places a shape for them.
 */

/* ---------- the front-view pictures (inches) ---------- */

const BODY: FigurePart = { shape: "rect", x: 0, y: 0, w: 2.5, h: 4 };
const HEAD: FigurePart = { shape: "ellipse", x: 0, y: 3.85, w: 2.5, h: 2.5 };
const HAIR: FigurePart = { shape: "dome", x: 0, y: 5.0, w: 2.75, h: 1.45 };
const OBI: FigurePart = { shape: "rect", x: 0, y: 1.8, w: 2.75, h: 0.5 };
const done = (part: FigurePart): FigurePart => ({ ...part, state: "done" });
const added = (part: FigurePart): FigurePart => ({ ...part, state: "new" });
const hole = (part: FigurePart): FigurePart => ({ ...part, state: "hole" });
const DOLL = [done(BODY), done(HEAD)];
const DRESSED = [...DOLL, done(HAIR), done(OBI)];

/* ---------- small check builders ---------- */

const needBody = (then: (body: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => (scene) => {
  const body = findBody(scene);
  return body ? then(body, scene) : fail("Start with the body: a shape at least 1.5 in tall standing on the workplane.");
};

const needHead = (then: (head: Part, body: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => needBody((body, scene) => {
  const head = findHead(scene);
  return head ? then(head, body, scene) : fail("Add the head: a sphere at least 1.5 in across, above the body.");
});

/** The hair or helmet: the biggest dome or sphere that covers the top of the head. */
function findHair(scene: LessonScene) {
  const head = findHead(scene);
  if (!head) return null;
  return solids(scene)
    .filter((part) => part !== head && (part.kind === "halfSphere" || part.kind === "sphere" || part.kind === "ellipse") && part.w >= head.w * 0.9 && part.box.maxY >= head.box.maxY - 1 && touches(part, head))
    .sort((a, b) => b.w - a.w)[0] ?? null;
}

const needHair = (then: (hair: Part, head: Part, scene: LessonScene) => ReturnType<StepCheck>): StepCheck => needHead((head, _body, scene) => {
  const hair = findHair(scene);
  return hair ? then(hair, head, scene) : fail("Cover the top of the head with a Half sphere a little wider than the head.");
});

/** Parts of about the same size, at least `count` of them, all touching `target`: what a pattern makes. */
function patternAround(parts: Part[], target: Part, count: number) {
  const touching = parts.filter((part) => touches(part, target, 1));
  const bySize = new Map<string, number>();
  for (const part of touching) {
    const key = [part.shape.width, part.shape.height, part.shape.depth].map((value) => Math.round(value)).join("x");
    bySize.set(key, (bySize.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...bySize.values()) >= count;
}

/** Long and thin by its own size (not its box, which a tilt makes round). */
const elongated = (part: Part) => {
  const sizes = [part.shape.width, part.shape.height, part.shape.depth].sort((a, b) => a - b);
  return sizes[2] >= sizes[0] * 2.2;
};

const printable: StepCheck = connectedAndPrintable;

/* ---------- sections ---------- */

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
    title: "Your plan",
    body: "You'll build your doll from simple shapes, one part at a time: body, head, hair or a helmet, kimono, a face and an accessory. Then you'll 3D print it.\n\nEvery step names the skill you are practising. At any step you can choose My own design and build it your way, and come back to the guided steps whenever you like.",
    figure: { parts: [done(BODY), { ...done(HEAD) }, done(HAIR), done(OBI)], caption: "The parts you'll build, from the bottom up." },
  },
  {
    id: "look",
    title: "Look around",
    body: "Right-drag to orbit around the workplane, scroll to zoom, and middle-drag to pan. Try each one now.",
    skill: "Navigate the view",
    hint: "Lost? The house button next to the view cube brings the view back to the start.",
  },
  {
    id: "undo",
    title: "Your undo button",
    body: "Mistakes are fine. Ctrl+Z (Cmd+Z on a Mac) takes one step back, and Ctrl+Y goes forward again.",
    skill: "Undo",
    didYouKnow: "Layerling also keeps a history slider, so you can look at any earlier version of your design.",
  },
];

const bodySteps = {
  place: {
    id: "body-place",
    title: "Place the body",
    body: "Open the shapes and drag a Cylinder onto the middle of the workplane, where the orange outline is in the picture.",
    skill: "Place a shape",
    figure: { parts: [added(BODY)], caption: "The body stands on the workplane." },
    // Any shape on the workplane: a new cylinder is small until the next step sizes it.
    check: (scene) => (solids(scene).some((part) => part.box.minY < 1.5) ? pass() : fail("Drag a Cylinder onto the workplane.")),
    success: "Your doll has a body.",
    hint: "The Cylinder is in the basic shapes. Drag it, don't just click it, so it lands where you let go.",
  } satisfies LessonStep,
  size: {
    id: "body-size",
    title: "Make it doll-sized",
    body: "Select the cylinder. Type 2.5 in for its width and length, and 4 in for its height.",
    skill: "Resize by typing",
    figure: { parts: [added(BODY)], caption: "2.5 in wide, 4 in tall." },
    check: (scene) => {
      // The biggest shape on the workplane, before it is tall enough to count as the body.
      const body = findBody(scene) ?? solids(scene).filter((part) => part.box.minY < 1.5).sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d)[0];
      if (!body) return fail("Drag a Cylinder onto the workplane first.");
      if (!between(body.w, inches(2), inches(3))) return fail(`Make the body between 2 and 3 in wide (it is ${formatInches(body.w)}).`);
      if (!between(body.h, inches(3.25), inches(4.75))) return fail(`Make the body between 3.25 and 4.75 in tall (it is ${formatInches(body.h)}).`);
      return pass();
    },
    success: "Right size. Typing a size is exact; dragging a handle is quick.",
    hint: "Click the number next to a handle (or use the size boxes in the shape's card) and type the value.",
  } satisfies LessonStep,
};

const headSteps: LessonStep[] = [
  {
    id: "head-place",
    title: "Add the head",
    body: "Drag a Sphere onto the workplane next to the body. You'll move it up in a moment.",
    skill: "Stack shapes",
    figure: { parts: [done(BODY), added(HEAD)], caption: "The head goes on top of the body." },
    check: needHead(() => pass()),
    hint: "Drag the black arrow above a selected shape to lift it, or type its height above the workplane.",
  },
  {
    id: "head-size",
    title: "Size it",
    body: "Make the head about 2.5 in across. Kokeshi heads are big compared with the body.",
    figure: { parts: [done(BODY), added(HEAD)] },
    check: needHead((head) => (between(head.w, inches(2), inches(3)) ? pass() : fail("Make the head between 2 and 3 in across."))),
  },
  {
    id: "head-align",
    title: "Line it up",
    body: "Select the head and the body, then use Align to centre them left to right and front to back. Then lower the head until it sinks about 0.15 in into the body.",
    skill: "Align",
    figure: { parts: [done(BODY), added(HEAD)], caption: "The head overlaps the body a little." },
    check: needHead((head, body) => {
      if (Math.abs(head.cx - body.cx) > 0.6 || Math.abs(head.cz - body.cz) > 0.6) return fail("Centre the head over the body with Align.");
      const overlap = body.box.maxY - head.box.minY;
      if (overlap < inches(0.05)) return fail("Lower the head so it sinks into the body a little.");
      if (overlap > inches(0.3)) return fail("The head is sunk too deep. Raise it until only about 0.15 in is inside the body.");
      return pass();
    }),
    success: "Centred and joined.",
    hint: "Overlap means the parts print as one piece. A gap means the head falls off.",
  },
  {
    id: "head-group",
    title: "Join them",
    body: "Select the head and the body and press Group.",
    skill: "Group",
    check: needHead((head, body) => (head.topId === body.topId ? pass() : fail("Select both and press Group."))),
    success: "Head and body are one object now.",
  },
];

const bobSteps: LessonStep[] = [
  {
    id: "bob-dome",
    title: "Cap the head",
    body: "Drag a Half sphere over the head and make it a little wider than the head, about 2.75 in. Align it to the head's centre and sink it until it sits like a cap.",
    skill: "Align",
    figure: { parts: [...DOLL, added(HAIR)] },
    check: needHair(() => pass()),
  },
  {
    id: "bob-fringe",
    title: "Cut the fringe",
    body: "Add a Box and make it a Hole. Slide it over the front of the hair where the face will be, so only the fringe stays.",
    skill: "Hole",
    figure: { parts: [...DOLL, done(HAIR), hole({ shape: "rect", x: 0, y: 4.2, w: 1.9, h: 1.1 })], caption: "The grey box cuts the hair away from the face." },
    check: needHair((hair, _head, scene) => (holes(scene).some((part) => touches(part, hair)) ? pass() : fail("Add a Box, set it to Hole, and move it into the front of the hair."))),
    hint: "Select the box, then pick Hole in the shape's card. It turns see-through grey.",
  },
  {
    id: "bob-group",
    title: "Group to cut",
    body: "Select the hair and the hole and press Group. The hole cuts away the face.",
    skill: "Group",
    check: needHair((hair, _head, scene) => (holes(scene).some((part) => part.topId === hair.topId) ? pass() : fail("Select the hair and the hole together and press Group."))),
    success: "A hole only cuts once it is grouped with the shape it cuts.",
  },
];

const bunStep: LessonStep = {
  id: "bun",
  title: "Add the bun",
  body: "Put a small Sphere, about 0.9 in, on top of the hair. Align it to the centre and sink it a little into the hair.",
  skill: "Align",
  figure: { parts: [...DOLL, done(HAIR), added({ shape: "ellipse", x: 0, y: 6.2, w: 0.9, h: 0.9 })] },
  check: needHair((hair, head, scene) => {
    const bun = solids(scene).find((part) => part !== hair && part !== head && between(part.w, inches(0.5), inches(1.3)) && part.cy > head.box.maxY - inches(0.2) && touches(part, hair));
    return bun ? pass() : fail("Add a sphere 0.5 to 1.3 in across on top of the hair, touching it.");
  }),
  didYouKnow: "A thin Torus around the bun makes a hair tie.",
};

const pigtailSteps: LessonStep[] = [
  {
    id: "pigtail-one",
    title: "One pigtail",
    body: "Stretch a Sphere into an egg shape (about 0.8 x 0.8 x 1.4 in) and place it on one side of the hair. Turn it about 20 degrees so it hangs outward.",
    skill: "Rotate",
    figure: { parts: [...DOLL, done(HAIR), added({ shape: "ellipse", x: -1.55, y: 4.2, w: 0.8, h: 1.4, tilt: 20 })] },
    check: needHair((hair, head, scene) => (extras(scene).some((part) => part !== hair && touches(part, hair) && Math.abs(part.cx - head.cx) > head.w * 0.35) ? pass() : fail("Place a pigtail on one side of the hair, touching it."))),
  },
  {
    id: "pigtail-mirror",
    title: "Mirror the other",
    body: "Duplicate the pigtail (Ctrl+D), use Mirror to flip it left to right, and move it to the other side so both match.",
    skill: "Mirror",
    figure: { parts: [...DOLL, done(HAIR), done({ shape: "ellipse", x: -1.55, y: 4.2, w: 0.8, h: 1.4, tilt: 20 }), added({ shape: "ellipse", x: 1.55, y: 4.2, w: 0.8, h: 1.4, tilt: -20 })] },
    check: needHair((hair, head, scene) => (mirroredPair(extras(scene).filter((part) => part !== hair && touches(part, hair)), head.cx, 1.5) ? pass() : fail("Make the two pigtails the same size and the same distance from the middle."))),
    didYouKnow: "Mirror guarantees both sides match exactly. Placing by hand never quite does.",
  },
];

const helmetSteps: LessonStep[] = [
  {
    id: "helmet-bowl",
    title: "The helmet bowl",
    body: "A Half sphere about 2.9 in across goes over the head like a bowl. Align it to the head's centre.",
    skill: "Align",
    figure: { parts: [...DOLL, added({ shape: "dome", x: 0, y: 4.95, w: 2.9, h: 1.5 })] },
    check: needHair(() => pass()),
  },
  {
    id: "helmet-brim",
    title: "The brim",
    body: "A flattened Cylinder (or a Torus) about 3.4 in across and 0.15 in thick goes around the bottom of the bowl.",
    skill: "Resize by typing",
    figure: { parts: [...DOLL, done({ shape: "dome", x: 0, y: 4.95, w: 2.9, h: 1.5 }), added({ shape: "rect", x: 0, y: 4.9, w: 3.4, h: 0.15 })] },
    check: needHair((helmet, _head, scene) => (solids(scene).some((part) => part !== helmet && part.w > helmet.w && part.h < inches(0.45) && touches(part, helmet)) ? pass() : fail("Add a flat brim wider than the helmet, touching it."))),
  },
  {
    id: "helmet-crest",
    title: "The crest",
    body: "Stand a Crescent up on the front of the helmet. Turn it so its points face up, like horns.",
    skill: "Rotate",
    figure: { parts: [...DOLL, done({ shape: "dome", x: 0, y: 4.95, w: 2.9, h: 1.5 }), done({ shape: "rect", x: 0, y: 4.9, w: 3.4, h: 0.15 }), added({ shape: "crescent", x: 0, y: 6.1, w: 1.8, h: 0.9 })] },
    check: needHair((helmet, _head, scene) => (solids(scene).some((part) => part.kind === "crescent" && touches(part, helmet)) ? pass() : fail("Add a Crescent touching the front of the helmet."))),
    didYouKnow: "A samurai helmet's crest showed who the wearer was.",
  },
  {
    id: "helmet-guards",
    title: "Neck guards",
    body: "Put a Wedge on one side at the back of the helmet as a neck guard, then Duplicate and Mirror it for the other side.",
    skill: "Mirror",
    check: needHair((helmet, head, scene) => (mirroredPair(solids(scene).filter((part) => part.kind === "wedge" && touches(part, helmet, 1)), head.cx, 1.5) ? pass() : fail("Add two matching Wedges, one each side, touching the helmet."))),
  },
];

const sleeveSteps: LessonStep[] = [
  {
    id: "sleeve-one",
    title: "One sleeve",
    body: "Kimono sleeves sweep down from the shoulders and meet in front. Stretch a Sphere into a long egg (about 0.9 x 0.9 x 3 in). Tilt it down and forward so it runs from the shoulder to the front of the body.",
    skill: "Rotate on two axes",
    figure: { parts: [...DRESSED, added({ shape: "ellipse", x: -0.95, y: 1.6, w: 0.9, h: 2.6, tilt: -25 })], caption: "Seen from the front: the sleeve slants in toward the middle." },
    check: needBody((body, scene) => (extras(scene).some((part) => elongated(part) && touches(part, body)) ? pass() : fail("Add a long stretched shape touching the side of the body."))),
    hint: "Turn it with the curved arrows: once to slant it toward the front, once to lean it in toward the middle.",
  },
  {
    id: "sleeve-mirror",
    title: "Mirror the other sleeve",
    body: "Duplicate the sleeve, Mirror it left to right, and place it on the other shoulder so the two sleeve ends meet in front.",
    skill: "Mirror",
    figure: { parts: [...DRESSED, done({ shape: "ellipse", x: -0.95, y: 1.6, w: 0.9, h: 2.6, tilt: -25 }), added({ shape: "ellipse", x: 0.95, y: 1.6, w: 0.9, h: 2.6, tilt: 25 })] },
    check: needBody((body, scene) => (mirroredPair(extras(scene).filter((part) => elongated(part) && touches(part, body)), body.cx, 2) ? pass() : fail("Make the second sleeve a mirror image of the first."))),
  },
  {
    id: "sleeve-hands",
    title: "Hidden or cupped hands?",
    body: "Hidden hands: slide the sleeve ends together until they overlap in front, as if the hands are tucked inside.\n\nCupped hands: leave a small gap between the sleeve ends and put two small flattened Spheres there as hands. Cut a little Half sphere Hole into them to cup them.",
    skill: "Hole",
    check: printable,
    didYouKnow: "Long swinging sleeves, called furisode, were worn by young women for celebrations.",
  },
];

const sashSteps: LessonStep[] = [
  {
    id: "sash-cord",
    title: "The cord",
    body: "Wrap a thin cord around the middle of the obi: a Torus about 0.08 in thick, a little wider than the obi.",
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
    body: "At the back of the obi, build a bow: two Ellipses tilted outward (make the second with Mirror) and a small Sphere for the knot. Add two thin Boxes hanging down as the sash tails.",
    skill: "Mirror",
    check: needBody((body, scene) => {
      const obi = findObi(scene);
      if (!obi) return fail("Tie the obi first.");
      return mirroredPair(extras(scene).filter((part) => touches(part, obi, 1.5)), body.cx, 2) ? pass() : fail("Make the two bow loops mirror images, both touching the obi.");
    }),
  },
];

const kokeshi: Lesson = {
  id: "kokeshi",
  title: "Kokeshi Maker",
  subtitle: "Design and 3D print your own kokeshi doll",
  units: "Imperial",
  sections: [
    { id: "welcome", title: "Welcome", goal: "Learn what a kokeshi is and how to move around.", skills: ["Navigate the view", "Undo"], steps: welcome, guidedOnly: true },
    {
      id: "body",
      title: "Body",
      goal: "Give your doll a body about 2.5 in wide and 4 in tall, standing on the workplane.",
      skills: ["Place a shape", "Resize by typing", "Taper", "Sketch", "Revolve"],
      steps: [bodySteps.place, bodySteps.size],
      choices: [
        { id: "classic", label: "Classic", blurb: "A straight round body.", steps: [] },
        {
          id: "tapered",
          label: "Tapered",
          blurb: "Narrower at the shoulders.",
          steps: [{
            id: "body-taper",
            title: "Taper it",
            body: "With the body selected, open Taper in the shape's card and make the top about 1.9 in across.",
            skill: "Taper",
            figure: { parts: [added({ shape: "taper", x: 0, y: 0, w: 2.5, h: 4, topW: 1.9 })] },
            check: needBody((body) => {
              const shape = body.shape;
              const top = shape.taperTopWidth ?? (shape.taperTopScale !== undefined ? shape.taperTopScale * shape.width : shape.width);
              return top < shape.width - 1 || shape.kind === "cone" || shape.kind === "curvedCone" ? pass() : fail("Make the top of the body narrower than the bottom.");
            }),
          }],
        },
        {
          id: "curvy",
          label: "Curvy",
          blurb: "Draw the side outline and spin it.",
          steps: [{
            id: "body-revolve",
            title: "Draw and spin the body",
            body: "Delete the cylinder. Start a Sketch on the workplane and draw half of the body's side outline: a straight centre line, then a curve in at the waist and out at the hips. Then Revolve it around the centre line.",
            skill: "Sketch and Revolve",
            figure: { parts: [added({ shape: "line", x: 0, y: 0, w: 0, h: 4 }), added({ shape: "rect", x: 0.6, y: 0, w: 1.2, h: 4 })], caption: "Draw the right half; Revolve spins it into a full body." },
            check: needBody((body) => (body.kind !== "cylinder" && between(body.w, inches(2), inches(3)) ? pass() : fail("Revolve a half-outline into a body 2 to 3 in wide."))),
            didYouKnow: "Kokeshi bodies are turned on a lathe, which spins the wood while a blade shapes it. Revolve does the same thing in CAD.",
          }],
        },
      ],
      ownWayChecks: [
        { label: "A body at least 1.5 in tall stands on the workplane", check: needBody(() => pass()) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "head",
      title: "Head",
      goal: "Put a big round head on the body, centred and joined to it.",
      skills: ["Stack shapes", "Align", "Group"],
      steps: headSteps,
      ownWayChecks: [
        { label: "A round head sits on the body", check: needHead((head, body) => (touches(head, body) ? pass() : fail("The head must touch the body."))) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "hair",
      title: "Hair or helmet",
      goal: "Give your doll hair or a helmet that covers the top of the head.",
      skills: ["Hole", "Group", "Mirror", "Rotate", "Align"],
      choices: [
        { id: "bob", label: "Bob", blurb: "A rounded cap with a fringe.", steps: bobSteps },
        { id: "bun", label: "Bun", blurb: "A bob with a bun on top.", steps: [...bobSteps, bunStep] },
        { id: "pigtails", label: "Pigtails", blurb: "A bob with two matching tails.", steps: [...bobSteps, ...pigtailSteps] },
        { id: "helmet", label: "Helmet", blurb: "A samurai-style helmet with a crest.", steps: helmetSteps },
      ],
      ownWayChecks: [
        { label: "Hair or a helmet covers the top of the head", check: needHair(() => pass()) },
        { label: "It will print", check: printable },
      ],
    },
    {
      id: "kimono",
      title: "Kimono",
      goal: "Tie an obi around the body, then add sleeves, a sash or details.",
      skills: ["Hole", "Align", "Stretch on one axis", "Rotate on two axes", "Mirror", "Circular pattern", "Wrap around a cylinder"],
      steps: [{
        id: "obi",
        title: "Tie the obi",
        body: "Make a ring: a Cylinder about 2.75 in across and 0.5 in tall, with a slightly smaller Cylinder Hole inside it, grouped. Slide it around the middle of the body.",
        skill: "Hole",
        figure: { parts: [...DOLL, done(HAIR), added(OBI)] },
        check: needBody((_body, scene) => (findObi(scene) ? pass() : fail("Add a band 0.25 to 0.8 in tall around the middle of the body, a little wider than the body."))),
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
            body: "Place a thin Wedge on the front of the body, slanting in toward the middle. Duplicate it and Mirror it to make a V.",
            skill: "Place on a face",
            check: needBody((body, scene) => (mirroredPair(solids(scene).filter((part) => part.kind === "wedge" && touches(part, body)), body.cx, 1.5) ? pass() : fail("Add two matching Wedges in a V on the front of the body."))),
          }],
        },
        {
          id: "flowers",
          label: "Flowers",
          blurb: "A ring of flowers around the body.",
          steps: [{
            id: "flower-pattern",
            title: "Flower print",
            body: "Build one small flower: a Sphere for the centre and five stretched Spheres as petals. Group it. Then use Pattern, around a circle, so 6 to 8 copies circle the body.",
            skill: "Circular pattern",
            check: needBody((body, scene) => (patternAround(extras(scene), body, 5) ? pass() : fail("Make at least 5 matching copies around the body with Pattern."))),
            didYouKnow: "Pattern places copies at exactly even spacing. Try 5, 6 and 8 to see which looks best.",
          }],
        },
        {
          id: "wrap",
          label: "Wrap",
          blurb: "Text or shapes wrapped around the body.",
          steps: [{
            id: "wrap-design",
            title: "Wrapped design",
            body: "Write a word or lay out a row of small shapes, then use Cylinder wrap to bend them around the body.",
            skill: "Wrap around a cylinder",
            check: printable,
          }],
        },
      ],
      after: [{
        id: "raised-engraved",
        title: "Raised or engraved?",
        body: "Keep your details raised, or turn them into Holes and group them with the body to engrave them about 0.04 in deep.",
        check: printable,
        hint: "Raised details print best at 0.05 in thick or more.",
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
            body: "Duplicate the body, Hollow it to a 0.08 in wall, then cut away everything but the front with a Box Hole and Group.",
            skill: "Hollow",
            check: printable,
          }],
        },
        {
          id: "shoulders",
          label: "Shoulder guards",
          blurb: "A matching pair.",
          steps: [{
            id: "shoulder-guards",
            title: "Shoulder guards",
            body: "Flatten a Half sphere and place it on one shoulder. Duplicate and Mirror it for the other shoulder.",
            skill: "Mirror",
            check: needBody((body, scene) => (mirroredPair(extras(scene).filter((part) => part.kind === "halfSphere"), body.cx, 1.5) ? pass() : fail("Add two matching Half spheres, one on each shoulder."))),
          }],
        },
        {
          id: "skirt",
          label: "Skirt plates",
          blurb: "Plates all the way round.",
          steps: [{
            id: "skirt-plates",
            title: "Skirt plates",
            body: "Make one small rounded plate at the hip, round its edges with Fillet, then Pattern it around the body, 8 to 12 copies.",
            skill: "Pattern",
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
          body: "Use the Workplane tool and click the front of the head. New shapes now land on the face.",
          skill: "Workplane on a face",
        },
        {
          id: "face-eyes",
          title: "Eyes",
          body: "Two small Ellipses, 0.1 to 0.2 in. Place one, then Duplicate and Mirror it. Keep them raised, or make them Holes to engrave them.",
          skill: "Mirror",
          figure: { parts: [...DRESSED, added({ shape: "ellipse", x: -0.45, y: 4.95, w: 0.18, h: 0.12 }), added({ shape: "ellipse", x: 0.45, y: 4.95, w: 0.18, h: 0.12 })] },
          check: needHead((head, _body, scene) => {
            const small = allSmallOn(scene, head);
            return mirroredPair(small, head.cx, 1) ? pass() : fail("Add two matching eyes, the same distance from the middle of the face.");
          }),
        },
        {
          id: "face-mouth",
          title: "Brows and mouth",
          body: "A thin Crescent for each brow, and a small Crescent or Heart for the mouth.",
          skill: "Working at small scale",
          check: needHead((head, _body, scene) => (allSmallOn(scene, head).some((part) => part.kind === "crescent" || part.kind === "heart") ? pass() : fail("Add a small Crescent or Heart on the face."))),
        },
        {
          id: "face-cheeks",
          title: "Cheeks (optional)",
          body: "Two tiny flattened Spheres, mirrored, make rosy cheeks.",
        },
        {
          id: "face-measure",
          title: "Measure it",
          body: "Open the Measure tool and check that nothing on the face is smaller than 0.04 in.",
          skill: "Measure",
          didYouKnow: "Most printers can't make details smaller than the nozzle, usually about 0.016 in (0.4 mm).",
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
      skills: ["Workplane on a face", "Hole", "Pattern", "Hollow", "Rotate", "Align"],
      multi: true,
      choices: [
        { id: "fan", label: "Fan", blurb: "A folding fan.", steps: [accessoryStep("fan", "Fan", "Cut a thin Cylinder to a half or quarter circle with a Box Hole. Add ribs with Pattern and a short handle where the hand is.", "Pattern")] },
        { id: "sword", label: "Sword", blurb: "A katana leaning on the body.", steps: [accessoryStep("sword", "Sword", "A long thin Box for the blade, a Cylinder for the handle and a flat disc for the guard. Lean it on the body so it touches in two places.", "Rotate", "Lean it on the body. A sword that sticks out sideways snaps off when printed.")] },
        { id: "umbrella", label: "Umbrella", blurb: "A parasol over the shoulder.", steps: [accessoryStep("umbrella", "Umbrella", "A Half sphere or Cone for the canopy, Hollowed, and a thin Cylinder handle. Add ribs with Pattern.", "Hollow")] },
        { id: "flower", label: "Flower", blurb: "A flower to hold or wear.", steps: [accessoryStep("flower", "Flower", "Five stretched Spheres as petals, made with Pattern around a small centre Sphere. Hold it at the hands or put it in the hair.", "Pattern")] },
        { id: "ornament", label: "Ornament", blurb: "A hair pin or another bow.", steps: [accessoryStep("ornament", "Hair ornament", "A hair pin (a thin Cylinder with a small Sphere end) or a bow like the sash bow, placed in the hair.", "Align")] },
      ],
      ownWayChecks: [{ label: "It will print", check: printable }],
    },
    {
      id: "print",
      title: "Print prep",
      goal: "Make the doll one solid, printable piece and export it.",
      skills: ["Check for floating parts", "Measure", "Group", "Export"],
      guidedOnly: true,
      steps: [
        {
          id: "print-floating",
          title: "Find floating parts",
          body: "Every part must touch the doll, or it falls off the print. The check below tells you if anything is floating.",
          skill: "Check for floating parts",
          check: (scene) => {
            const floating = floatingObjects(scene);
            return floating.length ? fail(`${floating.length} part${floating.length === 1 ? " is" : "s are"} floating: ${floating.map((part) => part.shape.name).slice(0, 3).join(", ")}.`) : pass();
          },
          success: "Everything is connected.",
        },
        {
          id: "print-flat",
          title: "Flat bottom",
          body: "The bottom of the doll must sit flat on the workplane, at height 0.",
          check: (scene) => {
            const lowest = Math.min(...solids(scene).map((part) => part.box.minY));
            return Number.isFinite(lowest) && Math.abs(lowest) < 0.3 ? pass() : fail("Move the doll so its lowest point is on the workplane.");
          },
        },
        {
          id: "print-size",
          title: "Final size",
          body: "Measure the whole doll. It should be 6 to 8 in tall.",
          skill: "Measure",
          check: (scene) => {
            const top = Math.max(...solids(scene).map((part) => part.box.maxY));
            return between(top, inches(6), inches(8)) ? pass() : fail(`The doll is ${(top / 25.4).toFixed(1)} in tall. Aim for 6 to 8 in.`);
          },
        },
        {
          id: "print-group",
          title: "Group everything",
          body: "Select everything (Ctrl+A) and press Group so the doll exports as one piece.",
          skill: "Group",
          check: (scene) => {
            const objects = topObjects(scene).filter((part) => !part.hole);
            return objects.length === 1 ? pass() : fail(`There are ${objects.length} separate objects. Select all and Group.`);
          },
        },
        {
          id: "print-done",
          title: "Congratulations!",
          body: "You designed a kokeshi from scratch. Export it as STL or 3MF from the export menu and send it to the printer. Your teacher can see your finished design in LayerLab.",
          didYouKnow: "Hair, armor and accessories can also be printed in separate colours if your printer allows it. Ask your teacher.",
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

function accessoryStep(id: string, title: string, body: string, skill: string, hint?: string): LessonStep {
  return { id: `accessory-${id}`, title, body, skill, hint, check: printable, success: "It touches the doll and is thick enough to print." };
}

export default kokeshi;
