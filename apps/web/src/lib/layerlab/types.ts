/** What the LayerLab API and page exchange. No server imports here: the page loads this too. */

export const LAYERLAB_ENDPOINT = "/api/layerlab";

export type LayerLabStudent = { id: string; name: string; joinedAt: number; /** Signs in with a Google account. */ google?: boolean };

export type LayerLabTutorial = {
  id: string;
  title: string;
  /** Plain text; blank lines start a new paragraph. */
  body: string;
  /** A video or web page that goes with it. */
  link?: string;
  /** The starter a student can begin this tutorial from. */
  starterId?: string;
  /** A guided lesson built into the editor (lib/lessons), e.g. "kokeshi": students start a new design with its step-by-step panel. */
  lessonId?: string;
  createdAt: number;
};

export type LayerLabStarter = { id: string; title: string; createdAt: number; size: number };

export type LayerLabClassSummary = { id: string; name: string; code: string; createdAt: number; students: number };

export type LayerLabClass = {
  id: string;
  name: string;
  code: string;
  createdAt: number;
  students: LayerLabStudent[];
  tutorials: LayerLabTutorial[];
  starters: LayerLabStarter[];
};

/** A design in a student's folder; `key` is its path in that folder, "folder/name.lyl". */
export type LayerLabDesign = {
  key: string;
  name: string;
  updatedAt: number;
  size: number;
  iterations: number;
  comments: number;
  /** Set when the first iteration was a teacher's starter. */
  starterTitle?: string;
};

export type LayerLabIteration = {
  id: string;
  savedAt: number;
  size: number;
  hasThumbnail: boolean;
  /** "starter" for the copy a student began from; saves have none. */
  source?: "starter";
  starterTitle?: string;
};

export type LayerLabComment = {
  id: string;
  author: "teacher" | "student";
  authorName: string;
  text: string;
  createdAt: number;
  /** The iteration the comment was written against, when it was. */
  iterationId?: string;
};

export type LayerLabStatus = {
  enabled: boolean;
  /** LayerLab keeps student work in the server store; without it there is nowhere to save. */
  storeEnabled: boolean;
  role: "teacher" | "student" | null;
  student?: { classId: string; className: string; studentId: string; name: string };
  /** Google sign-in: whether it is set up, and a student who signed in with Google but has not picked a class yet. */
  google?: { enabled: boolean; pending?: { name: string; classes: Array<{ id: string; name: string }> } };
};

/** What the page does next for a student who signed in with Google. */
export type LayerLabGoogleAnswer =
  | { ok: true }
  | { needs: "code" }
  | { needs: "pick"; classes: Array<{ id: string; name: string }> }
  | { needs: "pin"; className: string; name: string };
