import type { WorkplaneShape } from "@/types/layerling";

/**
 * Guided lessons (Kokeshi Maker and later ones): a side panel that walks a student through a
 * design one step at a time, Tinkercad-lesson style. A lesson is plain data plus check functions
 * that read the scene, so nothing here touches the editor's state.
 */

export type CheckResult = { ok: boolean; message?: string };

/** What a check sees: the design's shapes as the editor holds them (millimetres), and its name. */
export type LessonScene = { shapes: WorkplaneShape[]; projectName?: string };

/**
 * An orange outline drawn on the build plate where the next part goes, like Tinkercad's lessons,
 * in millimetres: x and z the centre, y the bottom.
 */
export type GhostPart = {
  kind: "box" | "cylinder" | "sphere" | "halfSphere" | "cone";
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** Drawn grey, as a hole. */
  hole?: boolean;
};

export type StepCheck = (scene: LessonScene) => CheckResult;

/**
 * A front-view sketch of the doll at this step, in inches: x is the centre left/right, y the
 * bottom of the part above the workplane. "new" parts are drawn as the orange placement outline.
 */
export type FigurePart = {
  shape: "rect" | "ellipse" | "taper" | "dome" | "ring" | "crescent" | "line" | "tri";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tilt in degrees, clockwise, around the part's centre. */
  tilt?: number;
  state?: "done" | "new" | "hole";
  /** Taper: the top's width. */
  topW?: number;
};

export type StepFigure = { parts: FigurePart[]; caption?: string; /** Highest point shown, inches. */ height?: number };

export type LessonStep = {
  id: string;
  title: string;
  /** Paragraphs; a blank line starts a new one. */
  body: string;
  skill?: string;
  hint?: string;
  didYouKnow?: string;
  figure?: StepFigure;
  /** Without a check, Next is always on (and the step teaches no skill of its own). */
  check?: StepCheck;
  /** Where the part goes, drawn on the build plate until the check passes. */
  ghost?: (scene: LessonScene) => GhostPart[] | null;
  /** Shown with the green tick when the check passes. */
  success?: string;
};

export type LessonChoice = {
  id: string;
  label: string;
  /** One line under the label in the menu. */
  blurb: string;
  steps: LessonStep[];
};

export type LessonSection = {
  id: string;
  title: string;
  optional?: boolean;
  /** One sentence: what this section adds to the doll. Shown in "My own design" mode. */
  goal: string;
  /** The skills a student would usually use here; the own-way card lists them. */
  skills: string[];
  /** Steps everyone does first, before any choice. */
  steps?: LessonStep[];
  /** A menu: the student picks one (or, with `multi`, several in turn). */
  choices?: LessonChoice[];
  multi?: boolean;
  /** Steps everyone does after the choice. */
  after?: LessonStep[];
  /** Checks for "My own design": the goal is met and the part will print. */
  ownWayChecks?: { label: string; check: StepCheck }[];
  /** No "My own design" option (the welcome and the final checks). */
  guidedOnly?: boolean;
  /** Freestyle: no steps, only the skills card and the print checks. */
  freestyle?: boolean;
};

export type Lesson = {
  id: string;
  title: string;
  /** Shown at the top of the panel. */
  subtitle: string;
  sections: LessonSection[];
  /** The workspace units the lesson's numbers are in; the panel offers to switch. */
  units: "Imperial" | "Metric (Default)";
  /** A library of shape builders the panel offers at its top (Layered Mandala's rings), with the student's own saved motifs. */
  library?: "mandala";
  /** The freestyle page's opening sentence, before the list of skills. */
  freestyleText?: string;
};
