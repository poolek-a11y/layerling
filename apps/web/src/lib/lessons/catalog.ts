/**
 * The guided lessons by id and title, without their content: what LayerLab's server and pages
 * need to offer a lesson, kept apart so they don't load the lesson checks.
 */
export const LESSON_OPTIONS = [{ id: "kokeshi", title: "Kokeshi Maker" }, { id: "mandala", title: "Traditional Mandala" }, { id: "mandala-cross", title: "Mandala Cross" }] as const;

export const isLessonId = (value: unknown): value is string => typeof value === "string" && LESSON_OPTIONS.some((lesson) => lesson.id === value);

export function lessonLink(base: string, lessonId: string) {
  return `${base}${base.includes("?") ? "&" : "?"}lesson=${encodeURIComponent(lessonId)}`;
}
