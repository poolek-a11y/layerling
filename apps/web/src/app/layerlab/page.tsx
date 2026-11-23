"use client";

import { LESSON_OPTIONS, lessonLink } from "@/lib/lessons/catalog";
import { ArrowLeft, BookOpen, GraduationCap, History, KeyRound, LogOut, MessageSquare, Plus, RefreshCw, Share2, Trash2, Upload, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  classPageUrl,
  classroomShareUrl,
  designPageUrl,
  openClassroomShare,
  readLayerLabPageLink,
  type LayerLabPageLink,
} from "@/lib/layerlab/classroomShare";
import { fetchLayerLabStatus, layerLabCall, layerLabFileUrl, layerLabUpload } from "@/lib/layerlab/client";
import { LAYERLAB_NEW_DESIGN_URL, layerLabCopyUrl, layerLabOpenUrl } from "@/lib/layerlab/editorLink";
import type {
  LayerLabClass,
  LayerLabClassSummary,
  LayerLabComment,
  LayerLabDesign,
  LayerLabGoogleAnswer,
  LayerLabIteration,
  LayerLabStatus,
  LayerLabStudent,
  LayerLabTutorial,
} from "@/lib/layerlab/types";
import "./layerlab.css";

/*
 * LayerLab: a classroom around layerling. The teacher makes classes, hands out a join code, adds
 * tutorials and starter designs, and opens every student's work - each design with the states it
 * went through and a comment thread both sides can write in. Students design in the ordinary
 * editor; their designs are saved in a server folder of their own.
 */

function when(time: number) {
  return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </>
  );
}

function Notice({ text, onClose }: { text: string; onClose: () => void }) {
  if (!text) return null;
  return (
    <div className="layerlab-notice" role="status">
      <span>{text}</span>
      <button type="button" className="layerlab-icon-button" onClick={onClose} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}

const GOOGLE_MESSAGES: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  expired: "That Google sign-in took too long. Try again.",
  domain: "Use your school Google account. That account is not from your school.",
  unverified: "Google has not verified that account's email address yet.",
  failed: "Google sign-in did not work. Try again, or ask your teacher.",
};

/** The page address without the one-time Google answer, so a reload does not show it again. */
function withoutGoogleParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete("google");
  return `${url.pathname}${url.search}${url.hash}`;
}

export default function LayerLabPage() {
  const [status, setStatus] = useState<LayerLabStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState<LayerLabPageLink>({});

  const refresh = useCallback(async () => setStatus(await fetchLayerLabStatus()), []);
  useEffect(() => {
    const read = readLayerLabPageLink(window.location.search);
    setLink(read);
    if (read.google) {
      if (GOOGLE_MESSAGES[read.google]) setNotice(GOOGLE_MESSAGES[read.google]);
      window.history.replaceState(null, "", withoutGoogleParam());
    }
    void refresh();
  }, [refresh]);

  const signOut = async () => {
    await layerLabCall("signOut").catch(() => undefined);
    await refresh();
  };

  let body: ReactNode;
  if (!status) body = <p className="layerlab-muted">Loading…</p>;
  else if (!status.enabled) body = <SetupNeeded />;
  else if (status.role === "teacher") body = <TeacherView storeEnabled={status.storeEnabled} link={link} onNotice={setNotice} />;
  else if (status.role === "student" && status.student) body = <StudentView status={status} link={link} onNotice={setNotice} />;
  else if (status.google?.pending) body = <GoogleContinue pending={status.google.pending} code={link.code ?? ""} onSignedIn={refresh} onSignOut={signOut} onNotice={setNotice} />;
  else body = <SignIn google={Boolean(status.google?.enabled)} initialCode={link.code ?? ""} onSignedIn={refresh} onNotice={setNotice} />;

  return (
    <main className="layerlab-shell">
      <header className="layerlab-topbar">
        <a className="layerlab-brand" href="/layerlab">
          <img src="/assets/layerling/layerling-logo.svg" alt="" />
          <span>
            <strong>LayerLab</strong>
            <small>
              {status?.role === "teacher" ? "Teacher" : status?.student ? `${status.student.name} · ${status.student.className}` : "Classroom for layerling"}
            </small>
          </span>
        </a>
        <div className="layerlab-topbar-actions">
          <a className="layerlab-button" href="/">
            <ArrowLeft size={15} /> layerling
          </a>
          {status?.role ? (
            <button type="button" className="layerlab-button" onClick={signOut}>
              <LogOut size={15} /> Sign out
            </button>
          ) : null}
        </div>
      </header>
      <Notice text={notice} onClose={() => setNotice("")} />
      <div className="layerlab-content">{body}</div>
    </main>
  );
}

function SetupNeeded() {
  return (
    <section className="layerlab-card layerlab-narrow">
      <h1>LayerLab is not switched on</h1>
      <p>
        LayerLab runs on a layerling server. Set <code>LAYERLAB_TEACHER_PASSWORD</code> and <code>LAYERLING_SHARED_PROJECTS_DIR</code> for the
        server and start it again. The setup is described in <code>docs/layerlab.md</code>.
      </p>
    </section>
  );
}

/* ---------- signing in ---------- */

/** Sends the browser to Google; it comes back to this very page, so a class code or a design link still applies. */
function googleSignInHref() {
  return `/api/layerlab/google?${new URLSearchParams({ next: withoutGoogleParam() }).toString()}`;
}

function GoogleButton({ label = "Sign in with Google" }: { label?: string }) {
  return (
    <a className="layerlab-button layerlab-google-button" href={googleSignInHref()}>
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.1z" />
        <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
      </svg>
      {label}
    </a>
  );
}

/** A student who signed in with Google and still needs a class: pick one, type a code, or confirm a PIN once. */
function GoogleContinue({ pending, code: initialCode, onSignedIn, onSignOut, onNotice }: {
  pending: { name: string; classes: Array<{ id: string; name: string }> };
  code: string;
  onSignedIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [pin, setPin] = useState("");
  const [askPin, setAskPin] = useState<{ className: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  const go = useCallback(async (choice: { code?: string; classId?: string; pin?: string; asNew?: boolean }) => {
    setBusy(true);
    try {
      const answer = await layerLabCall<LayerLabGoogleAnswer>("googleContinue", choice);
      if ("ok" in answer) {
        onNotice("");
        await onSignedIn();
        return;
      }
      if (answer.needs === "pin") setAskPin({ className: answer.className, name: answer.name });
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [onNotice, onSignedIn]);

  // A link from Google Classroom carries the class code: try it once straight away.
  useEffect(() => {
    if (initialCode && !tried.current) {
      tried.current = true;
      void go({ code: initialCode });
    }
  }, [initialCode, go]);

  if (askPin) {
    return (
      <form className="layerlab-card layerlab-narrow" onSubmit={(event) => { event.preventDefault(); void go({ code, pin }); }}>
        <h1><GraduationCap size={20} /> Is this you?</h1>
        <p>
          <strong>{askPin.name}</strong> already joined <strong>{askPin.className}</strong> with a PIN. If that is you, type your PIN once to link your
          Google account. After that, Google signs you in.
        </p>
        <label>
          PIN
          <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} inputMode="numeric" type="password" maxLength={8} required autoFocus />
        </label>
        <div className="layerlab-row">
          <button type="submit" className="layerlab-button primary" disabled={busy}>Link and sign in</button>
          <button type="button" className="layerlab-button" disabled={busy} onClick={() => go({ code, asNew: true })}>
            That is someone else, I am new
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="layerlab-signin">
      {pending.classes.length ? (
        <section className="layerlab-card">
          <h1><GraduationCap size={20} /> Hi {pending.name}, pick your class</h1>
          <ul className="layerlab-list">
            {pending.classes.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.name}</strong>
                <span className="layerlab-spacer" />
                <button type="button" className="layerlab-button primary" disabled={busy} onClick={() => go({ classId: entry.id })}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form className="layerlab-card" onSubmit={(event) => { event.preventDefault(); void go({ code }); }}>
        <h1><GraduationCap size={20} /> {pending.classes.length ? "Join another class" : `Hi ${pending.name}, join your class`}</h1>
        <p className="layerlab-muted">Type the class code from your teacher. You only do this once: next time Google signs you straight in.</p>
        <label>
          Class code
          <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoComplete="off" placeholder="ABC234" required />
        </label>
        <div className="layerlab-row">
          <button type="submit" className="layerlab-button primary" disabled={busy}>Join</button>
          <button type="button" className="layerlab-button" onClick={onSignOut}>Use a different account</button>
        </div>
      </form>
    </div>
  );
}

function SignIn({ google, initialCode, onSignedIn, onNotice }: {
  google: boolean;
  initialCode: string;
  onSignedIn: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [code, setCode] = useState(initialCode);
  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmClass, setConfirmClass] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async (event: FormEvent, create = false) => {
    event.preventDefault();
    setBusy(true);
    try {
      const answer = await layerLabCall<{ needsConfirm?: boolean; className?: string }>("studentJoin", { code, name, pin, create });
      if (answer.needsConfirm) {
        setConfirmClass(answer.className ?? "");
        return;
      }
      onNotice("");
      await onSignedIn();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const teacher = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await layerLabCall("teacherSignIn", { password });
      onNotice("");
      await onSignedIn();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="layerlab-signin">
      <form className="layerlab-card" onSubmit={(event) => join(event)}>
        <h1>
          <GraduationCap size={20} /> Join your class
        </h1>
        {google ? (
          <>
            <p className="layerlab-muted">Sign in with your school Google account. The first time, you type the class code from your teacher.</p>
            <GoogleButton />
            <p className="layerlab-divider"><span>or join with a PIN</span></p>
          </>
        ) : null}
        <p className="layerlab-muted">Use the code from your teacher. The first time, pick a PIN you will remember. You will need it to sign in again.</p>
        <label>
          Class code
          <input value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setConfirmClass(null); }} autoComplete="off" placeholder="ABC234" required />
        </label>
        <label>
          Your name
          <input value={name} onChange={(event) => { setName(event.target.value); setConfirmClass(null); }} maxLength={40} required />
        </label>
        <label>
          PIN (4 to 8 digits)
          <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} inputMode="numeric" type="password" maxLength={8} required />
        </label>
        {confirmClass !== null ? (
          <div className="layerlab-confirm">
            <p>
              Join <strong>{confirmClass}</strong> as <strong>{name}</strong>? If you joined before, check how you spelled your name.
            </p>
            <button type="button" className="layerlab-button primary" disabled={busy} onClick={(event) => join(event, true)}>
              Yes, join
            </button>
          </div>
        ) : (
          <button type="submit" className="layerlab-button primary" disabled={busy}>
            Join
          </button>
        )}
      </form>
      <form className="layerlab-card" onSubmit={teacher}>
        <h1>
          <KeyRound size={20} /> Teacher
        </h1>
        {google ? <GoogleButton label="Teacher sign in with Google" /> : null}
        <p className="layerlab-muted">{google ? "Or use the password set for this server." : "The password is the one set for this server."}</p>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button type="submit" className="layerlab-button primary" disabled={busy}>
          Sign in
        </button>
      </form>
    </div>
  );
}

/* ---------- the teacher ---------- */

type Selected = { classId: string; student: LayerLabStudent; design: LayerLabDesign } | null;

function TeacherView({ storeEnabled, link, onNotice }: { storeEnabled: boolean; link: LayerLabPageLink; onNotice: (text: string) => void }) {
  const [classes, setClasses] = useState<LayerLabClassSummary[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LayerLabClass | null>(null);
  const [designs, setDesigns] = useState<Record<string, LayerLabDesign[]>>({});
  const [tab, setTab] = useState<"students" | "tutorials">("students");
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  // A design link a student turned in on Google Classroom opens that design once its class is loaded.
  const [wanted, setWanted] = useState(link.design ?? null);

  const fail = useCallback((error: unknown) => onNotice((error as Error).message), [onNotice]);

  useEffect(() => {
    if (link.design) {
      setWanted(link.design);
      setClassId(link.design.classId);
    }
  }, [link.design]);

  useEffect(() => {
    if (!wanted || !current || current.id !== wanted.classId) return;
    const student = current.students.find((entry) => entry.id === wanted.studentId);
    const design = designs[wanted.studentId]?.find((entry) => entry.key === wanted.key);
    if (student && design) setSelected({ classId: current.id, student, design });
    else onNotice("That design is not here any more. It may have been renamed or the student removed.");
    setWanted(null);
  }, [wanted, current, designs, onNotice]);

  const loadClasses = useCallback(async () => {
    try {
      const answer = await layerLabCall<{ classes: LayerLabClassSummary[] }>("listClasses");
      setClasses(answer.classes);
      setClassId((currentId) => currentId ?? answer.classes[0]?.id ?? null);
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const loadClass = useCallback(async (id: string) => {
    try {
      const answer = await layerLabCall<{ class: LayerLabClass; designs: Record<string, LayerLabDesign[]> }>("getClass", { classId: id });
      setCurrent(answer.class);
      setDesigns(answer.designs);
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);
  useEffect(() => {
    if (classId) void loadClass(classId);
    else setCurrent(null);
  }, [classId, loadClass]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const answer = await layerLabCall<{ class: LayerLabClass }>("createClass", { name: newName });
      setNewName("");
      setClassId(answer.class.id);
      await loadClasses();
    } catch (error) {
      fail(error);
    }
  };

  const classAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!current) return;
    try {
      const answer = await layerLabCall<{ class?: LayerLabClass }>(action, { classId: current.id, ...extra });
      if (answer.class) setCurrent(answer.class);
      await loadClasses();
    } catch (error) {
      fail(error);
    }
  };

  const removeClass = async () => {
    if (!current || !window.confirm(`Delete the class "${current.name}"? Its students can no longer sign in to it. Their designs stay on the server.`)) return;
    await classAction("deleteClass");
    setClassId(null);
    setCurrent(null);
    await loadClasses();
  };

  return (
    <div className="layerlab-teacher">
      <aside className="layerlab-card layerlab-classes">
        <h2>Classes</h2>
        <ul>
          {classes.map((entry) => (
            <li key={entry.id}>
              <button type="button" className={entry.id === classId ? "active" : ""} onClick={() => setClassId(entry.id)}>
                <span>{entry.name}</span>
                <small>{plural(entry.students, "student")}</small>
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={create} className="layerlab-inline-form">
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New class, e.g. Year 8 Design" maxLength={60} required />
          <button type="submit" className="layerlab-button primary" aria-label="Create class">
            <Plus size={15} />
          </button>
        </form>
      </aside>

      <section className="layerlab-main">
        {!storeEnabled ? (
          <div className="layerlab-card layerlab-warning">
            Student work needs the server folder: set <code>LAYERLING_SHARED_PROJECTS_DIR</code>.
          </div>
        ) : null}
        {!current ? (
          <div className="layerlab-card">
            <h1>Welcome to LayerLab</h1>
            <p>Start by creating a class on the left. Students join with its code and design in layerling, and their work shows up here.</p>
          </div>
        ) : (
          <>
            <div className="layerlab-card layerlab-class-head">
              <div>
                <h1>{current.name}</h1>
                <p className="layerlab-muted">Students go to this site, choose LayerLab and type the code.</p>
                <button type="button" className="layerlab-button" onClick={() => openClassroomShare(classroomShareUrl({
                  url: classPageUrl(window.location.origin, current.code),
                  title: `Join ${current.name} on LayerLab`,
                  body: `Open the link and sign in. Class code: ${current.code}`,
                  itemType: "material",
                }))}>
                  <Share2 size={14} /> Post the join link in Google Classroom
                </button>
              </div>
              <div className="layerlab-code">
                <small>Join code</small>
                <strong>{current.code}</strong>
                <button type="button" className="layerlab-button" onClick={() => classAction("newJoinCode")} title="Make a new code. The old one stops working.">
                  <RefreshCw size={14} /> New code
                </button>
              </div>
              <div className="layerlab-class-actions">
                <button type="button" className="layerlab-button" onClick={() => {
                  const name = window.prompt("New name for the class", current.name);
                  if (name) void classAction("renameClass", { name });
                }}>
                  Rename
                </button>
                <button type="button" className="layerlab-button danger" onClick={removeClass}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>

            <nav className="layerlab-tabs">
              <button type="button" className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>
                <Users size={15} /> Students and work
              </button>
              <button type="button" className={tab === "tutorials" ? "active" : ""} onClick={() => setTab("tutorials")}>
                <BookOpen size={15} /> Tutorials and starters
              </button>
              <button type="button" className="layerlab-tab-refresh" onClick={() => loadClass(current.id)} title="Refresh">
                <RefreshCw size={15} />
              </button>
            </nav>

            {tab === "students" ? (
              <StudentsPanel
                current={current}
                designs={designs}
                onOpen={(student, design) => setSelected({ classId: current.id, student, design })}
                onAction={classAction}
              />
            ) : (
              <TutorialsPanel current={current} onChanged={setCurrent} onNotice={onNotice} />
            )}
          </>
        )}
      </section>

      {selected ? (
        <DesignReview
          role="teacher"
          classId={selected.classId}
          student={selected.student}
          design={selected.design}
          onClose={() => {
            setSelected(null);
            if (classId) void loadClass(classId);
          }}
          onNotice={onNotice}
        />
      ) : null}
    </div>
  );
}

function StudentsPanel({ current, designs, onOpen, onAction }: {
  current: LayerLabClass;
  designs: Record<string, LayerLabDesign[]>;
  onOpen: (student: LayerLabStudent, design: LayerLabDesign) => void;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
}) {
  if (!current.students.length) {
    return <div className="layerlab-card layerlab-muted">No students yet. Give them the join code <strong>{current.code}</strong>.</div>;
  }
  return (
    <div className="layerlab-students">
      {current.students.map((student) => {
        const work = designs[student.id] ?? [];
        return (
          <div key={student.id} className="layerlab-card layerlab-student">
            <div className="layerlab-student-head">
              <h3>{student.name}</h3>
              {student.google ? <span className="layerlab-tag" title="Signs in with a Google account">Google</span> : null}
              <small className="layerlab-muted">joined {when(student.joinedAt)} · {plural(work.length, "design")}</small>
              <span className="layerlab-spacer" />
              <button type="button" className="layerlab-button" onClick={() => {
                const pin = window.prompt(`New PIN for ${student.name} (4 to 8 digits)`);
                if (pin) void onAction("resetPin", { studentId: student.id, pin });
              }}>
                <KeyRound size={14} /> Reset PIN
              </button>
              <button type="button" className="layerlab-button danger" onClick={() => {
                if (window.confirm(`Remove ${student.name} from the class? Their designs stay on the server.`)) void onAction("removeStudent", { studentId: student.id });
              }}>
                <Trash2 size={14} />
              </button>
            </div>
            {work.length ? (
              <div className="layerlab-designs">
                {work.map((design) => (
                  <DesignCard key={design.key} classId={current.id} studentId={student.id} design={design} onOpen={() => onOpen(student, design)} />
                ))}
              </div>
            ) : (
              <p className="layerlab-muted">Nothing saved yet.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DesignCard({ classId, studentId, design, onOpen }: { classId: string; studentId: string; design: LayerLabDesign; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const thumbnail = layerLabFileUrl("designThumbnail", { class: classId, student: studentId, key: design.key, v: String(design.updatedAt) });
  return (
    <button type="button" className="layerlab-design" onClick={onOpen}>
      <span className="layerlab-design-picture">
        {broken ? <span className="layerlab-muted">No picture yet</span> : <img src={thumbnail} alt="" onError={() => setBroken(true)} />}
      </span>
      <strong>{design.name}</strong>
      <small className="layerlab-muted">{when(design.updatedAt)}</small>
      <span className="layerlab-badges">
        <span title="Saved versions"><History size={12} /> {design.iterations}</span>
        <span title="Comments" className={design.comments ? "has" : ""}><MessageSquare size={12} /> {design.comments}</span>
        {design.starterTitle ? <span title="Began from this starter">from {design.starterTitle}</span> : null}
      </span>
    </button>
  );
}

function TutorialsPanel({ current, onChanged, onNotice }: { current: LayerLabClass; onChanged: (next: LayerLabClass) => void; onNotice: (text: string) => void }) {
  const [editing, setEditing] = useState<Partial<LayerLabTutorial> | null>(null);
  const [starterTitle, setStarterTitle] = useState("");
  const [starterFile, setStarterFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (action: string, extra: Record<string, unknown>) => {
    try {
      const answer = await layerLabCall<{ class: LayerLabClass }>(action, { classId: current.id, ...extra });
      onChanged(answer.class);
      return true;
    } catch (error) {
      onNotice((error as Error).message);
      return false;
    }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!starterFile) return;
    const formElement = event.currentTarget;
    setBusy(true);
    const form = new FormData();
    form.append("classId", current.id);
    form.append("title", starterTitle);
    form.append("file", starterFile);
    try {
      const answer = await layerLabUpload<{ class: LayerLabClass }>(form);
      onChanged(answer.class);
      setStarterTitle("");
      setStarterFile(null);
      formElement.reset();
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (editing && (await call("saveTutorial", { tutorial: editing }))) setEditing(null);
  };

  return (
    <div className="layerlab-tutorials">
      <div className="layerlab-card">
        <h2>Starters</h2>
        <p className="layerlab-muted">
          A starter is a design students begin from. Build it in layerling, choose <em>Save as file</em> to get a <code>.lyl</code>, and upload it here.
          Each student gets their own copy, and their history shows that they began from it.
        </p>
        <ul className="layerlab-list">
          {current.starters.map((starter) => (
            <li key={starter.id}>
              <strong>{starter.title}</strong>
              <small className="layerlab-muted">{size(starter.size)} · {when(starter.createdAt)}</small>
              <span className="layerlab-spacer" />
              <a className="layerlab-button" href={layerLabCopyUrl(layerLabFileUrl("starter", { class: current.id, starter: starter.id }))}>Open</a>
              <button type="button" className="layerlab-button danger" onClick={() => {
                if (window.confirm(`Delete the starter "${starter.title}"? Copies students already made stay.`)) void call("deleteStarter", { starterId: starter.id });
              }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <form className="layerlab-inline-form" onSubmit={upload}>
          <input value={starterTitle} onChange={(event) => setStarterTitle(event.target.value)} placeholder="Name (optional)" maxLength={120} />
          <input type="file" accept=".lyl" onChange={(event) => setStarterFile(event.target.files?.[0] ?? null)} required />
          <button type="submit" className="layerlab-button primary" disabled={busy || !starterFile}>
            <Upload size={14} /> Upload
          </button>
        </form>
      </div>

      <div className="layerlab-card">
        <div className="layerlab-student-head">
          <h2>Tutorials</h2>
          <span className="layerlab-spacer" />
          <button type="button" className="layerlab-button primary" onClick={() => setEditing({ title: "", body: "", link: "" })}>
            <Plus size={14} /> New tutorial
          </button>
        </div>
        {editing ? (
          <form className="layerlab-tutorial-form" onSubmit={save}>
            <label>
              Title
              <input value={editing.title ?? ""} onChange={(event) => setEditing({ ...editing, title: event.target.value })} maxLength={120} required />
            </label>
            <label>
              Steps and instructions (a blank line starts a new paragraph)
              <textarea rows={8} value={editing.body ?? ""} onChange={(event) => setEditing({ ...editing, body: event.target.value })} />
            </label>
            <label>
              Video or web page (optional)
              <input value={editing.link ?? ""} onChange={(event) => setEditing({ ...editing, link: event.target.value })} placeholder="https://" />
            </label>
            <label>
              Guided lesson in the editor (optional)
              <select value={editing.lessonId ?? ""} onChange={(event) => setEditing({ ...editing, lessonId: event.target.value || undefined })}>
                <option value="">No guided lesson</option>
                {LESSON_OPTIONS.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
              </select>
            </label>
            <label>
              Starter (optional)
              <select value={editing.starterId ?? ""} onChange={(event) => setEditing({ ...editing, starterId: event.target.value || undefined })}>
                <option value="">No starter</option>
                {current.starters.map((starter) => <option key={starter.id} value={starter.id}>{starter.title}</option>)}
              </select>
            </label>
            <div className="layerlab-row">
              <button type="submit" className="layerlab-button primary">Save</button>
              <button type="button" className="layerlab-button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        ) : null}
        {current.tutorials.length ? current.tutorials.map((tutorial) => (
          <article key={tutorial.id} className="layerlab-tutorial">
            <div className="layerlab-student-head">
              <h3>{tutorial.title}</h3>
              <span className="layerlab-spacer" />
              <button type="button" className="layerlab-button" title="Post this tutorial as an assignment in Google Classroom" onClick={() => openClassroomShare(classroomShareUrl({
                url: classPageUrl(window.location.origin, current.code, tutorial.id),
                title: tutorial.title,
                body: `${tutorial.body.split(/\n\s*\n/)[0] ?? ""}\n\nOpen the link to start in LayerLab. When you are done, open your design in LayerLab and press "Turn in on Google Classroom".`.trim(),
                itemType: "assignment",
              }))}>
                <Share2 size={14} /> Assign in Classroom
              </button>
              <button type="button" className="layerlab-button" onClick={() => setEditing(tutorial)}>Edit</button>
              <button type="button" className="layerlab-button danger" onClick={() => {
                if (window.confirm(`Delete the tutorial "${tutorial.title}"?`)) void call("deleteTutorial", { tutorialId: tutorial.id });
              }}>
                <Trash2 size={14} />
              </button>
            </div>
            <TutorialBody tutorial={tutorial} current={current} />
          </article>
        )) : <p className="layerlab-muted">No tutorials yet.</p>}
      </div>
    </div>
  );
}

function TutorialBody({ tutorial, current, action }: { tutorial: LayerLabTutorial; current: LayerLabClass; action?: ReactNode }) {
  const starter = current.starters.find((entry) => entry.id === tutorial.starterId);
  const lesson = LESSON_OPTIONS.find((entry) => entry.id === tutorial.lessonId);
  return (
    <>
      <Paragraphs text={tutorial.body} />
      <div className="layerlab-row">
        {tutorial.link ? <a className="layerlab-button" href={tutorial.link} target="_blank" rel="noreferrer noopener">Open the video or page</a> : null}
        {starter ? <span className="layerlab-muted">Starter: {starter.title}</span> : null}
        {lesson && !action ? <span className="layerlab-muted">Guided lesson: {lesson.title}</span> : null}
        {action}
      </div>
    </>
  );
}

/* ---------- one design: its history and its comments ---------- */

function DesignReview({ role, classId, student, design, onClose, onNotice }: {
  role: "teacher" | "student";
  classId: string;
  student: LayerLabStudent;
  design: LayerLabDesign;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [iterations, setIterations] = useState<LayerLabIteration[]>([]);
  const [comments, setComments] = useState<LayerLabComment[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [aboutShown, setAboutShown] = useState(true);
  const [brokenPicture, setBrokenPicture] = useState<string | null>(null);
  const params = useMemo(() => ({ class: classId, student: student.id, key: design.key }), [classId, student.id, design.key]);

  useEffect(() => {
    void layerLabCall<{ iterations: LayerLabIteration[]; comments: LayerLabComment[] }>("design", { classId, studentId: student.id, key: design.key })
      .then((answer) => {
        setIterations(answer.iterations);
        setComments(answer.comments);
      })
      .catch((error) => onNotice((error as Error).message));
  }, [classId, student.id, design.key, onNotice]);

  const shownIteration = iterations.find((iteration) => iteration.id === shown) ?? null;
  const picture = shownIteration
    ? (shownIteration.hasThumbnail ? layerLabFileUrl("iterationThumbnail", { ...params, iteration: shownIteration.id }) : null)
    : layerLabFileUrl("designThumbnail", { ...params, v: String(design.updatedAt) });
  const openShown = shownIteration
    ? layerLabCopyUrl(layerLabFileUrl("iteration", { ...params, iteration: shownIteration.id }))
    : role === "student"
      ? layerLabOpenUrl(design.key.includes("/") ? design.key.slice(0, design.key.lastIndexOf("/")) : "", design.key.split("/").pop() ?? "")
      : layerLabCopyUrl(layerLabFileUrl("design", params));

  const send = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const answer = await layerLabCall<{ comments: LayerLabComment[] }>("addComment", {
        classId,
        studentId: student.id,
        key: design.key,
        text,
        iterationId: aboutShown && shownIteration ? shownIteration.id : undefined,
      });
      setComments(answer.comments);
      setText("");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  const remove = async (commentId: string) => {
    try {
      const answer = await layerLabCall<{ comments: LayerLabComment[] }>("deleteComment", { classId, studentId: student.id, key: design.key, commentId });
      setComments(answer.comments);
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  const iterationNumber = (id: string) => iterations.length - iterations.findIndex((iteration) => iteration.id === id);

  return (
    <div className="layerlab-overlay" role="dialog" aria-modal="true" aria-label={design.name}>
      <div className="layerlab-review">
        <header className="layerlab-review-head">
          <div>
            <h2>{design.name}</h2>
            <small className="layerlab-muted">{role === "teacher" ? `${student.name} · ` : ""}last saved {when(design.updatedAt)}</small>
          </div>
          <span className="layerlab-spacer" />
          {role === "student" ? (
            <button type="button" className="layerlab-button" title="Attach this design to an assignment in Google Classroom and turn it in" onClick={() => openClassroomShare(classroomShareUrl({
              url: designPageUrl(window.location.origin, classId, student.id, design.key),
              title: `${design.name} (${student.name})`,
              body: `My LayerLab design "${design.name}". The link opens it with every saved version and our comments.`,
            }))}>
              <Share2 size={14} /> Turn in on Google Classroom
            </button>
          ) : null}
          <a className="layerlab-button primary" href={openShown}>
            {shownIteration ? `Open version ${iterationNumber(shownIteration.id)}` : role === "student" ? "Open in layerling" : "Open a copy in layerling"}
          </a>
          <button type="button" className="layerlab-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="layerlab-review-body">
          <div className="layerlab-review-left">
            <div className="layerlab-review-picture">
              {picture && brokenPicture !== picture
                ? <img src={picture} alt="" onError={() => setBrokenPicture(picture)} />
                : <span className="layerlab-muted">No picture for this version yet</span>}
              <span className="layerlab-review-caption">
                {shownIteration ? `Version ${iterationNumber(shownIteration.id)} · ${when(shownIteration.savedAt)}` : "Latest"}
              </span>
            </div>

            <h3><History size={15} /> History ({iterations.length} {iterations.length === 1 ? "version" : "versions"})</h3>
            <p className="layerlab-muted">
              A version is kept every few minutes while {role === "teacher" ? "the student works" : "you work"}. Step through them to see how the design grew.
            </p>
            <ol className="layerlab-timeline">
              <li>
                <button type="button" className={shown === null ? "active" : ""} onClick={() => setShown(null)}>
                  <strong>Latest</strong>
                  <small>{when(design.updatedAt)}</small>
                </button>
              </li>
              {iterations.map((iteration, index) => {
                const previous = iterations[index + 1];
                const change = previous ? iteration.size - previous.size : 0;
                return (
                  <li key={iteration.id}>
                    <button type="button" className={shown === iteration.id ? "active" : ""} onClick={() => setShown(iteration.id)}>
                      {iteration.hasThumbnail ? <img src={layerLabFileUrl("iterationThumbnail", { ...params, iteration: iteration.id })} alt="" loading="lazy" /> : <span className="layerlab-timeline-blank" />}
                      <strong>Version {iterations.length - index}</strong>
                      <small>{when(iteration.savedAt)}</small>
                      <small className="layerlab-muted">
                        {iteration.source === "starter" ? `Starter: ${iteration.starterTitle ?? ""}` : previous ? `${change >= 0 ? "+" : "−"}${size(Math.abs(change))}` : size(iteration.size)}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="layerlab-review-right">
            <h3><MessageSquare size={15} /> Comments</h3>
            <ul className="layerlab-comments">
              {comments.length ? comments.map((comment) => (
                <li key={comment.id} className={comment.author}>
                  <div className="layerlab-comment-head">
                    <strong>{comment.authorName}</strong>
                    <small className="layerlab-muted">{when(comment.createdAt)}</small>
                    {comment.iterationId && iterations.some((iteration) => iteration.id === comment.iterationId) ? (
                      <button type="button" className="layerlab-link-button" onClick={() => setShown(comment.iterationId ?? null)}>
                        on version {iterationNumber(comment.iterationId)}
                      </button>
                    ) : null}
                    {role === "teacher" ? (
                      <button type="button" className="layerlab-icon-button" onClick={() => remove(comment.id)} aria-label="Delete comment">
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                  <Paragraphs text={comment.text} />
                </li>
              )) : <li className="layerlab-muted">{role === "teacher" ? "No comments yet. Your comments show up for the student here." : "No comments from your teacher yet."}</li>}
            </ul>
            <form className="layerlab-comment-form" onSubmit={send}>
              <textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={role === "teacher" ? "Feedback for the student…" : "Reply to your teacher…"} required />
              {shownIteration ? (
                <label className="layerlab-check">
                  <input type="checkbox" checked={aboutShown} onChange={(event) => setAboutShown(event.target.checked)} />
                  About version {iterationNumber(shownIteration.id)}
                </label>
              ) : null}
              <button type="submit" className="layerlab-button primary">Post comment</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- the student ---------- */

function StudentView({ status, link, onNotice }: { status: LayerLabStatus; link: LayerLabPageLink; onNotice: (text: string) => void }) {
  const student = status.student!;
  const [current, setCurrent] = useState<LayerLabClass | null>(null);
  const [designs, setDesigns] = useState<LayerLabDesign[]>([]);
  const [selected, setSelected] = useState<LayerLabDesign | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const answer = await layerLabCall<{ class: LayerLabClass; designs: LayerLabDesign[] }>("myClass");
      setCurrent(answer.class);
      setDesigns(answer.designs);
    } catch (error) {
      onNotice((error as Error).message);
    }
  }, [onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  // From a Classroom link: open the design it names, or scroll to the tutorial it names.
  const followed = useRef(false);
  useEffect(() => {
    if (followed.current || !current) return;
    followed.current = true;
    if (link.design && link.design.classId === student.classId && link.design.studentId === student.studentId) {
      const design = designs.find((entry) => entry.key === link.design?.key);
      if (design) setSelected(design);
    }
    if (link.tutorialId) document.getElementById(`tutorial-${link.tutorialId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current, designs, link, student.classId, student.studentId]);

  const start = async (starterId: string) => {
    setStarting(starterId);
    try {
      const answer = await layerLabCall<{ path: string; fileName: string }>("startFromStarter", { starterId });
      window.location.href = layerLabOpenUrl(answer.path, answer.fileName);
    } catch (error) {
      onNotice((error as Error).message);
      setStarting(null);
    }
  };

  const me: LayerLabStudent = { id: student.studentId, name: student.name, joinedAt: 0 };
  const startButton = (starterId: string) => (
    <button type="button" className="layerlab-button primary" disabled={starting !== null} onClick={() => start(starterId)}>
      {starting === starterId ? "Making your copy…" : "Start from the starter"}
    </button>
  );
  // A guided lesson starts from an empty workplane: students build every part themselves.
  const lessonButton = (lessonId: string) => (
    <a className="layerlab-button primary" href={lessonLink(LAYERLAB_NEW_DESIGN_URL, lessonId)}>Start the guided lesson</a>
  );
  const loneStarters = current?.starters.filter((starter) => !current.tutorials.some((tutorial) => tutorial.starterId === starter.id)) ?? [];

  return (
    <div className="layerlab-student-view">
      <section className="layerlab-card">
        <div className="layerlab-student-head">
          <h1>My work</h1>
          <span className="layerlab-spacer" />
          <button type="button" className="layerlab-icon-button" onClick={load} title="Refresh"><RefreshCw size={15} /></button>
          <a className="layerlab-button primary" href={LAYERLAB_NEW_DESIGN_URL}><Plus size={14} /> New design</a>
        </div>
        <p className="layerlab-muted">Everything you design in layerling is saved for your class, and your teacher can see it. Click a design to read your teacher&apos;s comments or to turn it in on Google Classroom.</p>
        {designs.length ? (
          <div className="layerlab-designs">
            {designs.map((design) => (
              <DesignCard key={design.key} classId={student.classId} studentId={student.studentId} design={design} onOpen={() => setSelected(design)} />
            ))}
          </div>
        ) : <p className="layerlab-muted">No designs yet. Start with a tutorial below or make a new design.</p>}
      </section>

      {current?.tutorials.length ? (
        <section className="layerlab-card">
          <h1><BookOpen size={20} /> Tutorials</h1>
          {current.tutorials.map((tutorial) => (
            <article key={tutorial.id} id={`tutorial-${tutorial.id}`} className={`layerlab-tutorial${link.tutorialId === tutorial.id ? " highlighted" : ""}`}>
              <h3>{tutorial.title}</h3>
              <TutorialBody tutorial={tutorial} current={current} action={tutorial.lessonId ? lessonButton(tutorial.lessonId) : tutorial.starterId ? startButton(tutorial.starterId) : null} />
            </article>
          ))}
        </section>
      ) : null}

      {loneStarters.length ? (
        <section className="layerlab-card">
          <h1>Starters</h1>
          <ul className="layerlab-list">
            {loneStarters.map((starter) => (
              <li key={starter.id}>
                <strong>{starter.title}</strong>
                <span className="layerlab-spacer" />
                {startButton(starter.id)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selected ? (
        <DesignReview role="student" classId={student.classId} student={me} design={selected} onClose={() => { setSelected(null); void load(); }} onNotice={onNotice} />
      ) : null}
    </div>
  );
}
