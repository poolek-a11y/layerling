import type { SketchPoint, SketchProfile, SketchSegment, SketchStroke } from "@/types/layerling";

/*
 * The mandala shape builders: one ring of a layered mandala at a time, as a sketch the editor
 * builds into a body. Every copy of the motif sits in the same sketch, turned round the middle, so
 * a layer is one body the student can open and change like any sketch they drew. With a line
 * width the outlines are built with the sketch tool's stroke: a frame round each petal instead of
 * a filled petal, and overlapping outlines cross over each other (the criss-cross layers).
 *
 * Sizes are millimetres, as the editor keeps them; the builders' defaults are written in inches,
 * as the lesson is. Each motif is drawn in its own frame pointing out along +x: it starts `radius`
 * from the middle and reaches `length` further out, `width` across.
 */

const IN = 25.4;
/** How far a cubic's handles reach to draw a quarter circle. */
const KAPPA = 0.5523;

export type MotifParams = {
  /** How many copies round the circle. */
  count: number;
  /** From the middle to where the motif starts, mm. */
  radius: number;
  /** How far the motif reaches out from there, mm. */
  length: number;
  /** How wide the motif is across, mm. */
  width: number;
  /** Line width of the stroke, mm; 0 builds the motif filled. */
  line: number;
  /** How thick the layer is, mm. */
  height: number;
  /** Turns the whole ring, degrees: half a step puts petals between the petals below. */
  turn: number;
};

export type MotifParamKey = keyof MotifParams;

export type MotifBuilder = {
  id: string;
  name: string;
  /** One line under the name. */
  blurb: string;
  /** Defaults in inches (count and turn as they are). */
  defaults: MotifParams;
  /** The settings this builder offers; the rest keep their defaults. */
  fields: MotifParamKey[];
  /** Only a line makes sense here (open lines, or outlines that must cross): a line width of 0 is not offered. */
  strokeOnly?: boolean;
  /** One shape for the whole layer, not copies round the circle. */
  single?: boolean;
  color: string;
};

/** A layer ready for the editor: the sketch, its thickness and a name. */
export type MotifLayer = { name: string; color: string; profile: SketchProfile; height: number; /** Across the whole layer, mm. */ diameter: number };

const inch = (params: MotifParams): MotifParams => ({
  ...params,
  radius: params.radius * IN,
  length: params.length * IN,
  width: params.width * IN,
  line: params.line * IN,
  height: params.height * IN,
});

/** The library, in the order the lesson uses it: a base, rings of petals, criss-cross rings, then the details. */
export const MOTIF_BUILDERS: MotifBuilder[] = [
  {
    id: "scallop-disc",
    name: "Scalloped base",
    blurb: "A round base with a wavy edge. The bottom layer everything sits on.",
    defaults: { count: 16, radius: 2.1, length: 0.15, width: 0, line: 0, height: 0.12, turn: 0 },
    fields: ["count", "radius", "length", "line", "height"],
    single: true,
    color: "#1f6fb2",
  },
  {
    id: "lotus",
    name: "Lotus petals",
    blurb: "Round at the bottom, pointed at the tip.",
    defaults: { count: 10, radius: 0.55, length: 1.4, width: 0.7, line: 0.06, height: 0.1, turn: 0 },
    fields: ["count", "radius", "length", "width", "line", "height", "turn"],
    color: "#e7399e",
  },
  {
    id: "teardrop",
    name: "Teardrops",
    blurb: "Pointed toward the middle, round on the outside.",
    defaults: { count: 12, radius: 0.6, length: 1.2, width: 0.55, line: 0.06, height: 0.1, turn: 0 },
    fields: ["count", "radius", "length", "width", "line", "height", "turn"],
    color: "#ff9e2c",
  },
  {
    id: "leaf",
    name: "Leaves",
    blurb: "Pointed at both ends, like an almond or a leaf.",
    defaults: { count: 8, radius: 0.5, length: 1.3, width: 0.55, line: 0.06, height: 0.1, turn: 0 },
    fields: ["count", "radius", "length", "width", "line", "height", "turn"],
    color: "#2fbf71",
  },
  {
    id: "crisscross-circles",
    name: "Criss-cross circles",
    blurb: "Circles that overlap their neighbours. The lines cross into a woven lattice.",
    defaults: { count: 12, radius: 0.35, length: 1.3, width: 0, line: 0.06, height: 0.1, turn: 0 },
    fields: ["count", "radius", "length", "line", "height", "turn"],
    strokeOnly: true,
    color: "#8a5bf0",
  },
  {
    id: "crisscross-petals",
    name: "Criss-cross petals",
    blurb: "Wide leaves that overlap, so every outline crosses the next.",
    defaults: { count: 12, radius: 0.45, length: 1.5, width: 0.9, line: 0.06, height: 0.1, turn: 0 },
    fields: ["count", "radius", "length", "width", "line", "height", "turn"],
    strokeOnly: true,
    color: "#16c0d4",
  },
  {
    id: "star",
    name: "Star",
    blurb: "One star with as many points as you like.",
    defaults: { count: 8, radius: 0.5, length: 0.6, width: 0, line: 0, height: 0.1, turn: 0 },
    fields: ["count", "radius", "length", "line", "height", "turn"],
    single: true,
    color: "#ffc93c",
  },
  {
    id: "diamond",
    name: "Diamonds",
    blurb: "Four straight sides, pointing out.",
    defaults: { count: 16, radius: 1.55, length: 0.35, width: 0.22, line: 0, height: 0.08, turn: 0 },
    fields: ["count", "radius", "length", "width", "line", "height", "turn"],
    color: "#ff5a47",
  },
  {
    id: "spike",
    name: "Spikes",
    blurb: "Triangles pointing out, like the rays of a sun.",
    defaults: { count: 24, radius: 1.75, length: 0.3, width: 0.14, line: 0, height: 0.08, turn: 0 },
    fields: ["count", "radius", "length", "width", "line", "height", "turn"],
    color: "#ff9e2c",
  },
  {
    id: "dots",
    name: "Dots",
    blurb: "Round dots in a ring.",
    defaults: { count: 16, radius: 1.75, length: 0.16, width: 0.16, line: 0, height: 0.08, turn: 0 },
    fields: ["count", "radius", "length", "line", "height", "turn"],
    color: "#ffffff",
  },
  {
    id: "rays",
    name: "Rays",
    blurb: "Straight lines out from the middle, built with a stroke.",
    defaults: { count: 24, radius: 0.4, length: 0.7, width: 0, line: 0.05, height: 0.08, turn: 0 },
    fields: ["count", "radius", "length", "line", "height", "turn"],
    strokeOnly: true,
    color: "#5b83c4",
  },
  {
    id: "ring",
    name: "Ring",
    blurb: "A circle drawn as a line: a frame between two layers, or round the edge.",
    defaults: { count: 1, radius: 1.8, length: 0, width: 0, line: 0.08, height: 0.08, turn: 0 },
    fields: ["radius", "line", "height"],
    strokeOnly: true,
    single: true,
    color: "#1f2933",
  },
  {
    id: "center",
    name: "Centre button",
    blurb: "A round button for the very middle.",
    defaults: { count: 1, radius: 0.35, length: 0, width: 0, line: 0, height: 0.12, turn: 0 },
    fields: ["radius", "line", "height"],
    single: true,
    color: "#ffc93c",
  },
];

/** Motifs of straight sides, whose stroke keeps mitred corners. */
const straightSided = (builder: MotifBuilder) => builder.id === "diamond" || builder.id === "spike" || builder.id === "star";

export const motifBuilder = (id: string) => MOTIF_BUILDERS.find((builder) => builder.id === id) ?? null;

/** The builder's defaults in millimetres. */
export const motifDefaults = (builder: MotifBuilder): MotifParams => inch(builder.defaults);

/* ---------- drawing ---------- */

type Vec = { x: number; z: number };
/** A point of an outline with the handles of the curves into and out of it, in the motif's own frame. */
type Node = Vec & { in?: Vec; out?: Vec };
type Outline = { nodes: Node[]; closed: boolean };

const v = (x: number, z: number): Vec => ({ x, z });

function ellipse(cx: number, cz: number, rx: number, rz: number): Outline {
  const kx = rx * KAPPA;
  const kz = rz * KAPPA;
  return {
    closed: true,
    nodes: [
      { x: cx + rx, z: cz, in: v(cx + rx, cz - kz), out: v(cx + rx, cz + kz) },
      { x: cx, z: cz + rz, in: v(cx + kx, cz + rz), out: v(cx - kx, cz + rz) },
      { x: cx - rx, z: cz, in: v(cx - rx, cz + kz), out: v(cx - rx, cz - kz) },
      { x: cx, z: cz - rz, in: v(cx - kx, cz - rz), out: v(cx + kx, cz - rz) },
    ],
  };
}

/** Round at `a`, pointed at `a + l`. */
function lotus(a: number, l: number, w: number): Outline {
  const h = w / 2;
  const side = a + 0.42 * l;
  return {
    closed: true,
    nodes: [
      { x: a + l, z: 0, in: v(a + 0.78 * l, -0.22 * w), out: v(a + 0.78 * l, 0.22 * w) },
      { x: side, z: h, in: v(side + 0.28 * l, h), out: v(side - 0.24 * l, h) },
      { x: a, z: 0, in: v(a, 0.36 * w), out: v(a, -0.36 * w) },
      { x: side, z: -h, in: v(side - 0.24 * l, -h), out: v(side + 0.28 * l, -h) },
    ],
  };
}

/** The lotus turned round: pointed toward the middle. */
function teardrop(a: number, l: number, w: number): Outline {
  const flipped = lotus(0, l, w);
  const flip = (point: Vec) => v(a + l - point.x, point.z);
  return {
    closed: true,
    nodes: flipped.nodes.map((node) => ({ ...flip(node), in: node.in && flip(node.in), out: node.out && flip(node.out) })),
  };
}

/** Pointed at both ends. */
function leaf(a: number, l: number, w: number): Outline {
  const h = w / 2;
  const mid = a + l / 2;
  return {
    closed: true,
    nodes: [
      { x: a + l, z: 0, in: v(a + 0.82 * l, -0.3 * h), out: v(a + 0.82 * l, 0.3 * h) },
      { x: mid, z: h, in: v(mid + 0.3 * l, h), out: v(mid - 0.3 * l, h) },
      { x: a, z: 0, in: v(a + 0.18 * l, 0.3 * h), out: v(a + 0.18 * l, -0.3 * h) },
      { x: mid, z: -h, in: v(mid - 0.3 * l, -h), out: v(mid + 0.3 * l, -h) },
    ],
  };
}

const polygon = (points: Vec[]): Outline => ({ closed: true, nodes: points.map((point) => ({ ...point })) });

const rotate = (point: Vec, angle: number): Vec => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return v(point.x * c - point.z * s, point.x * s + point.z * c);
};

/** The base's wavy edge: `count` bumps round a circle of `radius`, each `depth` deep. */
function scallopedCircle(count: number, radius: number, depth: number): Outline {
  const step = (Math.PI * 2) / count;
  const valley = Math.max(radius * 0.2, radius - depth);
  const nodes: Node[] = [];
  for (let index = 0; index < count; index += 1) {
    const peakAngle = index * step;
    const valleyAngle = peakAngle + step / 2;
    // The bump's top: handles along the circle, a third of the way to the valleys either side.
    const reach = (radius * step) / 3.2;
    const peak = rotate(v(radius, 0), peakAngle);
    const along = rotate(v(0, 1), peakAngle);
    nodes.push({ ...peak, in: v(peak.x - along.x * reach, peak.z - along.z * reach), out: v(peak.x + along.x * reach, peak.z + along.z * reach) });
    // The valley between two bumps: a sharp corner, its handles pulled out toward the bumps.
    const low = rotate(v(valley, 0), valleyAngle);
    const before = rotate(v(valley + depth * 0.45, -(valley * step) / 5), valleyAngle);
    const after = rotate(v(valley + depth * 0.45, (valley * step) / 5), valleyAngle);
    nodes.push({ ...low, in: before, out: after });
  }
  return { closed: true, nodes };
}

function star(count: number, inner: number, outer: number): Outline {
  const step = (Math.PI * 2) / count;
  const points: Vec[] = [];
  for (let index = 0; index < count; index += 1) {
    points.push(rotate(v(outer, 0), index * step), rotate(v(inner, 0), index * step + step / 2));
  }
  return polygon(points);
}

/** One copy of the motif in its own frame, pointing out along +x. */
function motifOutlines(id: string, p: MotifParams): Outline[] {
  const { radius: a, length: l, width: w } = p;
  switch (id) {
    case "lotus":
      return [lotus(a, l, w)];
    case "teardrop":
      return [teardrop(a, l, w)];
    case "leaf":
    case "crisscross-petals":
      return [leaf(a, l, w)];
    case "crisscross-circles":
      return [ellipse(a + l / 2, 0, l / 2, l / 2)];
    case "dots":
      return [ellipse(a + l / 2, 0, l / 2, l / 2)];
    case "diamond":
      return [polygon([v(a, 0), v(a + l / 2, -w / 2), v(a + l, 0), v(a + l / 2, w / 2)])];
    case "spike":
      return [polygon([v(a, -w / 2), v(a + l, 0), v(a, w / 2)])];
    case "rays":
      return [{ closed: false, nodes: [v(a, 0), v(a + l, 0)] }];
    default:
      return [];
  }
}

function singleOutlines(id: string, p: MotifParams): Outline[] {
  switch (id) {
    case "scallop-disc":
      return [scallopedCircle(p.count, p.radius, p.length)];
    case "star":
      return [star(p.count, p.radius, p.radius + p.length)];
    case "ring":
    case "center":
      return [ellipse(0, 0, p.radius, p.radius)];
    default:
      return [];
  }
}

const COUNT_LIMIT = 72;
const SIZE_LIMIT = 400;
const MIN_SIZE = 0.2;

/** Settings that the editor can build: whole counts in range, sizes above nothing and below the plate. */
export function cleanMotifParams(builder: MotifBuilder, params: Partial<MotifParams>): MotifParams {
  const defaults = motifDefaults(builder);
  const number = (key: MotifParamKey) => {
    const value = Number(params[key]);
    return Number.isFinite(value) ? value : defaults[key];
  };
  const size = (key: MotifParamKey, minimum = MIN_SIZE) => Math.min(SIZE_LIMIT, Math.max(minimum, number(key)));
  const minCount = builder.id === "scallop-disc" || builder.id === "star" ? 3 : 1;
  const line = Math.min(SIZE_LIMIT, Math.max(0, number("line")));
  return {
    count: Math.min(COUNT_LIMIT, Math.max(minCount, Math.round(number("count")))),
    radius: builder.single ? size("radius", 1) : Math.min(SIZE_LIMIT, Math.max(0, number("radius"))),
    length: builder.id === "ring" || builder.id === "center" ? 0 : size("length"),
    width: size("width"),
    // A line is needed where there would be nothing to fill; elsewhere 0 fills the motif.
    line: builder.strokeOnly ? Math.max(MIN_SIZE, line || defaults.line) : line < MIN_SIZE / 2 ? 0 : line,
    height: size("height"),
    turn: ((number("turn") % 360) + 360) % 360,
  };
}

/** How far the layer reaches from the middle, mm (before the line's width). */
export function motifReach(builder: MotifBuilder, p: MotifParams) {
  if (builder.id === "ring" || builder.id === "center" || builder.id === "scallop-disc") return p.radius;
  return p.radius + p.length;
}

/**
 * One layer of the mandala as a sketch centred on (0, 0): the motif `count` times round the
 * middle (or the one shape), with the stroke when it has a line width.
 */
export function buildMotifLayer(builderId: string, params: Partial<MotifParams> = {}): MotifLayer {
  const builder = motifBuilder(builderId);
  if (!builder) throw new Error(`There is no mandala builder called ${builderId}`);
  const p = cleanMotifParams(builder, params);
  const outlines: Outline[] = [];
  const turn = (p.turn * Math.PI) / 180;
  if (builder.single) {
    outlines.push(...singleOutlines(builder.id, p));
  } else {
    const one = motifOutlines(builder.id, p);
    for (let index = 0; index < p.count; index += 1) {
      const angle = turn + (index * Math.PI * 2) / p.count;
      const place = (point: Vec) => rotate(point, angle);
      outlines.push(...one.map((outline) => ({
        closed: outline.closed,
        nodes: outline.nodes.map((node) => ({ ...place(node), in: node.in && place(node.in), out: node.out && place(node.out) })),
      })));
    }
  }
  if (builder.single && turn) {
    outlines.forEach((outline) => {
      outline.nodes = outline.nodes.map((node) => ({ ...rotate(node, turn), in: node.in && rotate(node.in, turn), out: node.out && rotate(node.out, turn) }));
    });
  }
  const profile = sketchFromOutlines(outlines);
  if (p.line > 0) profile.stroke = strokeFor(builder, p.line);
  // A mitred point reaches further than half the line past its tip.
  const reach = motifReach(builder, p) + (p.line > 0 ? (straightSided(builder) ? p.line * 2 : p.line / 2) : 0);
  return { name: builder.name, color: builder.color, profile, height: p.height, diameter: reach * 2 };
}

function strokeFor(builder: MotifBuilder, width: number): SketchStroke {
  // Straight-sided motifs keep crisp mitred corners; curved petals and open rays get round tips and
  // ends, which print cleanly and don't grow spikes past the tip.
  return { width, align: "center", join: straightSided(builder) ? "miter" : "round", cap: builder.id === "rays" ? "round" : "flat" };
}

const round = (value: number) => Math.round(value * 10000) / 10000;
const roundVec = (point: Vec) => ({ x: round(point.x), z: round(point.z) });

/** The outlines as the sketch tool keeps them: points with absolute handles, a curve wherever both ends have one. */
export function sketchFromOutlines(outlines: Outline[]): SketchProfile {
  const points: SketchPoint[] = [];
  const segments: SketchSegment[] = [];
  outlines.forEach((outline, loop) => {
    const ids = outline.nodes.map((_, index) => `m${loop}-${index}`);
    outline.nodes.forEach((node, index) => {
      points.push({
        id: ids[index],
        ...roundVec(node),
        ...(node.in ? { handleIn: roundVec(node.in) } : {}),
        ...(node.out ? { handleOut: roundVec(node.out) } : {}),
        mode: node.in || node.out ? "split" : "corner",
      });
    });
    const last = outline.closed ? ids.length : ids.length - 1;
    for (let index = 0; index < last; index += 1) {
      const from = outline.nodes[index];
      const toIndex = (index + 1) % ids.length;
      const to = outline.nodes[toIndex];
      segments.push({ id: `m${loop}-s${index}`, startId: ids[index], endId: ids[toIndex], kind: from.out && to.in ? "bezier" : "line" });
    }
  });
  return { points, segments };
}
