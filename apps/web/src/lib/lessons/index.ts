import kokeshi from "@/lib/lessons/kokeshi";
import type { Lesson, LessonSection, LessonStep } from "@/lib/lessons/types";

export const LESSONS: Record<string, Lesson> = { [kokeshi.id]: kokeshi };


/* ---------- starting a lesson from a link ---------- */

const PENDING_KEY = "layerling.lesson.pending";
const PROGRESS_PREFIX = "layerling.lesson.progress.";

/**
 * `?lesson=kokeshi` on the start page (LayerLab's "Start the guided lesson" adds it to its new-design
 * link): remember it until a design is open, then the panel attaches the lesson to that design.
 */
export function captureLessonRequest() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const id = url.searchParams.get("lesson");
  if (!id) return;
  url.searchParams.delete("lesson");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (!LESSONS[id]) return;
  try {
    window.sessionStorage.setItem(PENDING_KEY, id);
  } catch {
    // A blocked storage only means the lesson does not open by itself.
  }
}

export function takePendingLesson() {
  try {
    const id = window.sessionStorage.getItem(PENDING_KEY);
    if (id) window.sessionStorage.removeItem(PENDING_KEY);
    return id && LESSONS[id] ? id : null;
  } catch {
    return null;
  }
}

/* ---------- progress, kept per design in this browser ---------- */

export type LessonProgress = {
  lessonId: string;
  section: number;
  /** The page inside each section (steps, the menu, then the chosen steps). */
  page: Record<string, number>;
  /** The choices picked in each section's menu. */
  chosen: Record<string, string[]>;
  /** Sections the student is doing their own way. */
  ownWay: Record<string, boolean>;
  /** Steps the student finished (the check passed, or a step without a check was read). */
  done: string[];
  /** Sections finished, for the star burst only once. */
  finished: string[];
  collapsed?: boolean;
};

export function loadProgress(projectId: string): LessonProgress | null {
  try {
    const raw = window.localStorage.getItem(PROGRESS_PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LessonProgress> | null;
    if (!parsed?.lessonId || !LESSONS[parsed.lessonId]) return null;
    return { ...newProgress(parsed.lessonId), ...parsed } as LessonProgress;
  } catch {
    return null;
  }
}

export function saveProgress(projectId: string, progress: LessonProgress | null) {
  try {
    if (progress) window.localStorage.setItem(PROGRESS_PREFIX + projectId, JSON.stringify(progress));
    else window.localStorage.removeItem(PROGRESS_PREFIX + projectId);
  } catch {
    // Progress that cannot be kept is only lost on a reload.
  }
}

export function newProgress(lessonId: string): LessonProgress {
  return { lessonId, section: 0, page: {}, chosen: {}, ownWay: {}, done: [], finished: [] };
}

/* ---------- a section as a list of pages ---------- */

export type LessonPage = { kind: "step"; step: LessonStep } | { kind: "menu" };

export function sectionPages(section: LessonSection, chosen: string[]): LessonPage[] {
  const pages: LessonPage[] = (section.steps ?? []).map((step) => ({ kind: "step", step }));
  if (section.choices?.length) {
    pages.push({ kind: "menu" });
    for (const choice of section.choices) {
      if (chosen.includes(choice.id)) pages.push(...choice.steps.map((step) => ({ kind: "step" as const, step })));
    }
  }
  pages.push(...(section.after ?? []).map((step) => ({ kind: "step" as const, step })));
  return pages;
}

/** Every skill a student practised in the steps they finished, with the first step that taught it. */
export function skillsUsed(lesson: Lesson, done: string[]) {
  const found = new Map<string, { section: number; stepId: string }>();
  lesson.sections.forEach((section, sectionIndex) => {
    const steps = [...(section.steps ?? []), ...(section.choices ?? []).flatMap((choice) => choice.steps), ...(section.after ?? [])];
    for (const step of steps) {
      if (step.skill && done.includes(step.id) && !found.has(step.skill)) found.set(step.skill, { section: sectionIndex, stepId: step.id });
    }
  });
  return [...found.entries()].map(([skill, where]) => ({ skill, ...where }));
}
