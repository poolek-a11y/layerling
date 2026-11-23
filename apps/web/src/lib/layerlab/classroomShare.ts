/**
 * Google Classroom's own share page: it lets a signed-in student attach a link to an assignment and
 * turn it in, or a teacher post one as an assignment or material. It needs no API key and no setup.
 * https://developers.google.com/workspace/classroom/guides/sharebutton
 */

const SHARE_PAGE = "https://classroom.google.com/share";

export type ClassroomItemType = "assignment" | "material" | "announcement" | "question";

export function classroomShareUrl(options: { url: string; title?: string; body?: string; itemType?: ClassroomItemType }) {
  const params = new URLSearchParams({ url: options.url });
  if (options.title) params.set("title", options.title.slice(0, 200));
  if (options.body) params.set("body", options.body.slice(0, 1000));
  if (options.itemType) params.set("itemtype", options.itemType);
  return `${SHARE_PAGE}?${params.toString()}`;
}

/** Opens the share page in a small window, as Google's button does; a blocked pop-up becomes a new tab. */
export function openClassroomShare(shareUrl: string) {
  const opened = window.open(shareUrl, "layerlab-classroom", "width=640,height=680");
  if (opened) opened.opener = null;
  else window.location.assign(shareUrl);
}

/** The LayerLab page with a student's design open: the link a student turns in, which opens it for the teacher. */
export function designPageUrl(origin: string, classId: string, studentId: string, key: string) {
  return `${origin}/layerlab?${new URLSearchParams({ class: classId, student: studentId, design: key }).toString()}`;
}

/** The LayerLab page with the class code filled in, and a tutorial to show: what the teacher posts in Classroom. */
export function classPageUrl(origin: string, code: string, tutorialId?: string) {
  const params = new URLSearchParams({ code });
  if (tutorialId) params.set("tutorial", tutorialId);
  return `${origin}/layerlab?${params.toString()}`;
}

export type LayerLabPageLink = {
  code?: string;
  tutorialId?: string;
  design?: { classId: string; studentId: string; key: string };
  google?: string;
};

export function readLayerLabPageLink(search: string): LayerLabPageLink {
  const params = new URLSearchParams(search);
  const link: LayerLabPageLink = {};
  const code = params.get("code")?.trim().toUpperCase();
  if (code && /^[A-Z0-9]{4,12}$/.test(code)) link.code = code;
  const tutorialId = params.get("tutorial");
  if (tutorialId && /^[a-z0-9]{6,32}$/.test(tutorialId)) link.tutorialId = tutorialId;
  const classId = params.get("class");
  const studentId = params.get("student");
  const key = params.get("design");
  if (classId && studentId && key) link.design = { classId, studentId, key };
  const google = params.get("google");
  if (google) link.google = google;
  return link;
}
