"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Compass, Lightbulb, PencilRuler, Sparkles, X } from "lucide-react";
import { LessonFigure } from "@/components/lessons/LessonFigure";
import { lessonText, type LessonUnits } from "@/lib/lessons/units";
import {
  LESSONS,
  loadProgress,
  newProgress,
  saveProgress,
  sectionAchieved,
  sectionPages,
  skillsUsed,
  takePendingLesson,
  type LessonProgress,
} from "@/lib/lessons";
import type { CheckResult, GhostPart, LessonScene, LessonSection } from "@/lib/lessons/types";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * The guided-lesson panel on the left of the editor (Kokeshi Maker and later lessons).
 * One step at a time: what to do, a picture of where the part goes, the skill it practises,
 * a hint, and a live check that turns Next on and cheers when the model is right. Every
 * section can also be done "my own way", with only its goal and the print checks.
 */

type Props = {
  projectId: string | null | undefined;
  shapes: WorkplaneShape[];
  /** The design's name: the lesson asks for Kokeshi_yourname. */
  projectName?: string;
  units: string;
  /** "fraction" when inches show as 1 5/8 instead of 1.625. */
  inchFormat?: string;
  /** Switches the workspace to these units ("Imperial" shows inches as decimals). */
  onUseUnits: (units: string) => void;
  /** The orange outlines of where the current step's part goes, for the 3D view; null for none. */
  onGhostChange?: (ghost: GhostPart[] | null) => void;
};

const STAR_COLOURS = ["#ff5a47", "#ff9e2c", "#ffc93c", "#2fbf71", "#16c0d4", "#8a5bf0", "#e7399e", "#5b83c4"];

export function LessonPanel({ projectId, shapes, projectName, units, inchFormat, onUseUnits, onGhostChange }: Props) {
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [burst, setBurst] = useState(0);

  // Each design keeps its own lesson; a lesson asked for by a link attaches to the design opened next.
  useEffect(() => {
    if (!projectId) {
      setProgress(null);
      return;
    }
    const stored = loadProgress(projectId);
    if (stored) {
      setProgress(stored);
      return;
    }
    const pending = takePendingLesson();
    const started = pending ? newProgress(pending) : null;
    // Saved at once, so an effect that runs twice (React's strict mode) finds it the second time.
    if (started) saveProgress(projectId, started);
    setProgress(started);
  }, [projectId]);

  // A new lesson design starts in the lesson's units (decimal inches for Kokeshi Maker), once:
  // after that the student's own choice of units stands.
  const lessonUnits = progress ? LESSONS[progress.lessonId]?.units : undefined;
  const unitsSettled = !progress || progress.unitsSet || (units === lessonUnits && (units !== "Imperial" || inchFormat === "decimal"));
  useEffect(() => {
    if (!progress || progress.unitsSet) return;
    if (unitsSettled) {
      setProgress((current) => (current ? { ...current, unitsSet: true } : current));
      return;
    }
    if (lessonUnits) onUseUnits(lessonUnits);
    // Runs again when the workspace's units change, until they are the lesson's.
  }, [progress, unitsSettled, lessonUnits, units, inchFormat]);

  useEffect(() => {
    if (projectId && progress) saveProgress(projectId, progress);
  }, [projectId, progress]);

  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(0), 1800);
    return () => window.clearTimeout(timer);
  }, [burst]);

  // The view cube and camera buttons sit on the left too: move them out from under the panel.
  const panelShown = Boolean(progress && !progress.collapsed);
  useEffect(() => {
    if (!panelShown) return;
    document.documentElement.dataset.lessonOpen = "true";
    return () => {
      delete document.documentElement.dataset.lessonOpen;
    };
  }, [panelShown]);

  const lesson = progress ? LESSONS[progress.lessonId] : null;
  const metric = Boolean(lesson && lesson.units === "Imperial" && units !== "Imperial");
  // Lessons are written in fractions of an inch; students read them as decimal inches unless
  // their workspace shows fractions or millimetres.
  const textUnits: LessonUnits = metric ? "metric" : inchFormat === "fraction" ? "fraction" : "decimal";
  const section: LessonSection | null = lesson && progress ? lesson.sections[Math.min(progress.section, lesson.sections.length - 1)] : null;
  const chosen = section && progress ? progress.chosen[section.id] ?? [] : [];
  const pages = useMemo(() => (section ? sectionPages(section, chosen) : []), [section, chosen]);
  const pageIndex = section && progress ? Math.min(progress.page[section.id] ?? 0, Math.max(0, pages.length - 1)) : 0;
  const page = pages[pageIndex];
  const ownWay = Boolean(section && progress && !section.guidedOnly && (section.freestyle || progress.ownWay[section.id]));
  const scene: LessonScene = useMemo(() => ({ shapes, projectName }), [shapes, projectName]);

  const step = page?.kind === "step" ? page.step : null;
  const result: CheckResult | null = useMemo(() => {
    if (!step?.check || ownWay) return null;
    try {
      return step.check(scene);
    } catch {
      return null;
    }
  }, [step, scene, ownWay]);

  const ownWayResults = useMemo(() => {
    if (!ownWay || !section?.ownWayChecks) return [];
    return section.ownWayChecks.map((entry) => {
      try {
        return { label: entry.label, result: entry.check(scene) };
      } catch {
        return { label: entry.label, result: { ok: false } as CheckResult };
      }
    });
  }, [ownWay, section, scene]);

  // A passing check counts the step as done, even if the student moves on with the section list.
  useEffect(() => {
    if (!step || !result?.ok) return;
    setProgress((current) => (current && !current.done.includes(step.id) ? { ...current, done: [...current.done, step.id] } : current));
  }, [step, result?.ok]);

  useEffect(() => setHintOpen(false), [step?.id, section?.id]);

  // The outline stays on the build plate until the part is in place, like Tinkercad's lessons.
  const ghost = useMemo(() => {
    if (!step?.ghost || ownWay || !result || result.ok) return null;
    try {
      return step.ghost(scene);
    } catch {
      return null;
    }
  }, [step, ownWay, result, scene]);
  const ghostKey = ghost ? JSON.stringify(ghost.map((part) => [part.kind, part.hole, ...[part.x, part.y, part.z, part.w, part.h, part.d].map((value) => Math.round(value * 10))])) : "";
  useEffect(() => {
    onGhostChange?.(ghost);
    // Redrawn only when the outline really moves, not on every edit.
  }, [ghostKey, onGhostChange]);
  useEffect(() => () => onGhostChange?.(null), [onGhostChange]);

  if (!progress || !lesson || !section) return null;

  const update = (change: (current: LessonProgress) => LessonProgress) => setProgress((current) => (current ? change(current) : current));
  const goTo = (sectionIndex: number, pageNumber = 0) => update((current) => ({
    ...current,
    section: sectionIndex,
    page: { ...current.page, [lesson.sections[sectionIndex].id]: pageNumber },
  }));

  // Stars only for a section really achieved: every check passed (or, done their own way, every
  // print check). Reading pages or skipping a check just moves on to the next section.
  const finishSection = () => {
    const achieved = ownWay
      ? ownWayResults.length > 0 && ownWayResults.every((entry) => entry.result.ok)
      : sectionAchieved(section, chosen, step && !step.check ? [...progress.done, step.id] : progress.done);
    const firstTime = achieved && !progress.finished.includes(section.id);
    if (firstTime) setBurst(Date.now());
    const nextSection = Math.min(progress.section + 1, lesson.sections.length - 1);
    update((current) => ({
      ...current,
      finished: firstTime ? [...current.finished, section.id] : current.finished,
      section: nextSection,
    }));
  };

  const markRead = () => {
    if (step && !step.check) update((current) => (current.done.includes(step.id) ? current : { ...current, done: [...current.done, step.id] }));
  };

  const next = () => {
    markRead();
    if (ownWay || pageIndex >= pages.length - 1) {
      finishSection();
      return;
    }
    update((current) => ({ ...current, page: { ...current.page, [section.id]: pageIndex + 1 } }));
  };

  const back = () => {
    if (!ownWay && pageIndex > 0) {
      update((current) => ({ ...current, page: { ...current.page, [section.id]: pageIndex - 1 } }));
      return;
    }
    if (progress.section > 0) {
      const previous = lesson.sections[progress.section - 1];
      const previousPages = sectionPages(previous, progress.chosen[previous.id] ?? []);
      goTo(progress.section - 1, Math.max(0, previousPages.length - 1));
    }
  };

  const choose = (choiceId: string) => update((current) => {
    const already = current.chosen[section.id] ?? [];
    const nextChosen = section.multi
      ? (already.includes(choiceId) ? already.filter((id) => id !== choiceId) : [...already, choiceId])
      : [choiceId];
    return { ...current, chosen: { ...current.chosen, [section.id]: nextChosen } };
  });

  const setOwnWay = (value: boolean) => update((current) => {
    const nextState = { ...current, ownWay: { ...current.ownWay, [section.id]: value } };
    if (value) return nextState;
    // Back to the guided steps: start at the first one not done yet, keeping what was built.
    const firstOpen = pages.findIndex((entry) => entry.kind === "menu" ? !(current.chosen[section.id]?.length) : !current.done.includes(entry.step.id));
    return { ...nextState, page: { ...nextState.page, [section.id]: firstOpen < 0 ? 0 : firstOpen } };
  });

  const stopLesson = () => {
    if (!window.confirm(`Close the ${lesson.title} lesson for this design? Your design stays as it is.`)) return;
    if (projectId) saveProgress(projectId, null);
    setProgress(null);
  };

  if (progress.collapsed) {
    return (
      <button type="button" className="lesson-panel-tab" onClick={() => update((current) => ({ ...current, collapsed: false }))} title="Show the lesson">
        <ChevronRight size={16} aria-hidden="true" />
        <span>{lesson.title}</span>
      </button>
    );
  }

  // Lessons are written in inches; a student working in millimetres reads every size in millimetres.
  const tx = (text: string) => lessonText(text, textUnits);

  const nextBlocked = !ownWay && ((page?.kind === "menu" && !chosen.length) || (result !== null && !result.ok));
  const isLast = progress.section === lesson.sections.length - 1 && (ownWay || pageIndex >= pages.length - 1);
  const skills = section.freestyle ? skillsUsed(lesson, progress.done) : [];

  return (
    <aside className="lesson-panel" aria-label={`${lesson.title} lesson`}>
      <header className="lesson-panel-head">
        <div className="lesson-panel-title">
          <strong>{lesson.title}</strong>
          <span>{lesson.subtitle}</span>
        </div>
        <button type="button" className="lesson-icon-button" onClick={() => update((current) => ({ ...current, collapsed: true }))} title="Hide the lesson" aria-label="Hide the lesson">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" className="lesson-icon-button" onClick={stopLesson} title="Close the lesson" aria-label="Close the lesson">
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      <label className="lesson-section-picker">
        <span className="visually-hidden">Section</span>
        <select value={progress.section} onChange={(event) => goTo(Number(event.target.value))}>
          {lesson.sections.map((entry, index) => (
            <option key={entry.id} value={index}>
              {progress.finished.includes(entry.id) ? "✓ " : ""}{index}. {entry.title}{entry.optional ? " (optional)" : ""}
            </option>
          ))}
        </select>
      </label>

      {lesson.units === "Imperial" ? (
        <div className="lesson-units" role="group" aria-label="Sizes in">
          <span>Sizes in</span>
          <button type="button" className={!metric ? "active" : ""} aria-pressed={!metric} onClick={() => onUseUnits("Imperial")}>Inches</button>
          <button type="button" className={metric ? "active" : ""} aria-pressed={metric} onClick={() => onUseUnits("Metric (Default)")}>Millimetres</button>
          {textUnits === "fraction" ? (
            <button type="button" className="lesson-link-button" onClick={() => onUseUnits("Imperial")}>Show decimals</button>
          ) : null}
        </div>
      ) : null}

      <div className="lesson-panel-body">
        {ownWay ? (
          <>
            <h2>{section.freestyle ? "Freestyle" : `${section.title}: my own design`}</h2>
            <p>{tx(section.goal)}</p>
            {section.freestyle ? (
              <>
                <p>No steps here. Build a new kokeshi, a family of dolls, or add more to yours. Here is every skill you have used so far:</p>
                {skills.length ? (
                  <ul className="lesson-skill-list">
                    {skills.map((entry) => (
                      <li key={entry.skill}>
                        <button type="button" className="lesson-link-button" onClick={() => {
                          const target = lesson.sections[entry.section];
                          const index = sectionPages(target, progress.chosen[target.id] ?? []).findIndex((candidate) => candidate.kind === "step" && candidate.step.id === entry.stepId);
                          update((current) => ({ ...current, ownWay: { ...current.ownWay, [target.id]: false } }));
                          goTo(entry.section, Math.max(0, index));
                        }}>
                          {entry.skill}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="lesson-muted">Finish some guided steps and your skills appear here.</p>}
              </>
            ) : (
              <>
                {section.skills.length ? (
                  <>
                    <p className="lesson-muted">Skills you might use:</p>
                    <p className="lesson-skill-chips">{section.skills.map((skill) => <span key={skill} className="lesson-skill">{skill}</span>)}</p>
                  </>
                ) : null}
              </>
            )}
            {ownWayResults.length ? (
              <ul className="lesson-check-list">
                {ownWayResults.map((entry) => (
                  <li key={entry.label} className={entry.result.ok ? "ok" : ""}>
                    {entry.result.ok ? <Check size={14} aria-hidden="true" /> : <span className="lesson-dot" aria-hidden="true" />}
                    <span>
                      {tx(entry.label)}
                      {!entry.result.ok && entry.result.message ? <small>{tx(entry.result.message)}</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {!section.freestyle ? (
              <button type="button" className="lesson-secondary-button" onClick={() => setOwnWay(false)}>
                <Compass size={15} aria-hidden="true" /> Show me the guided steps
              </button>
            ) : null}
          </>
        ) : page?.kind === "menu" ? (
          <>
            <h2>{section.title}: choose</h2>
            <p>{section.multi ? "Pick one or more. You'll build them one after another." : "Pick one. You can come back and change it later."}</p>
            <div className="lesson-menu">
              {section.choices?.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={chosen.includes(choice.id) ? "lesson-choice active" : "lesson-choice"}
                  aria-pressed={chosen.includes(choice.id)}
                  onClick={() => choose(choice.id)}
                >
                  <strong>{choice.label}</strong>
                  <span>{tx(choice.blurb)}</span>
                </button>
              ))}
            </div>
          </>
        ) : step ? (
          <>
            <h2>{tx(step.title)}</h2>
            {step.skill ? <p className="lesson-skill-chips"><span className="lesson-skill">Skill: {step.skill}</span></p> : null}
            {tx(step.body).split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {step.figure ? <LessonFigure figure={step.figure.caption ? { ...step.figure, caption: tx(step.figure.caption) } : step.figure} /> : null}
            {step.hint ? (
              <div className="lesson-hint">
                <button type="button" className="lesson-secondary-button" aria-expanded={hintOpen} onClick={() => setHintOpen((open) => !open)}>
                  <Lightbulb size={15} aria-hidden="true" /> Hint
                </button>
                {hintOpen ? <p>{tx(step.hint)}</p> : null}
              </div>
            ) : null}
            {result ? (
              <p className={result.ok ? "lesson-result ok" : "lesson-result"} role="status" aria-live="polite">
                {result.ok ? <Check size={15} aria-hidden="true" /> : <span className="lesson-dot" aria-hidden="true" />}
                <span>{tx(result.ok ? (result.message ?? step.success ?? "Nice, you did it!") : result.message ?? "Not yet.")}</span>
              </p>
            ) : null}
            {step.didYouKnow ? (
              <div className="lesson-tip">
                <strong><Sparkles size={14} aria-hidden="true" /> Did you know?</strong>
                <p>{tx(step.didYouKnow)}</p>
              </div>
            ) : null}
          </>
        ) : null}

        {!ownWay && !section.guidedOnly ? (
          <button type="button" className="lesson-link-button lesson-own-way" onClick={() => setOwnWay(true)}>
            <PencilRuler size={14} aria-hidden="true" /> My own design for this section
          </button>
        ) : null}
      </div>

      <footer className="lesson-panel-foot">
        <button type="button" className="lesson-icon-button round" onClick={back} disabled={progress.section === 0 && (ownWay || pageIndex === 0)} aria-label="Back" title="Back">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="lesson-count">{ownWay ? section.title : `${pageIndex + 1} / ${pages.length}`}</span>
        {nextBlocked && step?.check ? (
          <button type="button" className="lesson-link-button lesson-skip" onClick={next} title="The check can be wrong: skip if your design is right">
            Skip
          </button>
        ) : null}
        <button type="button" className="lesson-next" onClick={next} disabled={nextBlocked || (isLast && progress.finished.includes(section.id))}>
          {isLast ? "Complete" : "Next"} <ChevronRight size={15} aria-hidden="true" />
        </button>
      </footer>

      {burst ? (
        <div className="lesson-burst" aria-hidden="true" key={burst}>
          {Array.from({ length: 28 }, (_, index) => (
            <span
              key={index}
              style={{
                color: STAR_COLOURS[index % STAR_COLOURS.length],
                ["--angle" as string]: `${(index * 360) / 28}deg`,
                ["--reach" as string]: `${90 + (index % 4) * 38}px`,
                ["--delay" as string]: `${(index % 5) * 40}ms`,
              }}
            >
              ★
            </span>
          ))}
          <strong className="lesson-burst-text">Section complete!</strong>
        </div>
      ) : null}
    </aside>
  );
}
