"use client";

import { ArrowLeft, BookOpen, GraduationCap, History, KeyRound, LogOut, MessageSquare, Plus, RefreshCw, Trash2, Upload, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { fetchLayerLabStatus, layerLabCall, layerLabFileUrl, layerLabUpload } from "@/lib/layerlab/client";
import { LAYERLAB_NEW_DESIGN_URL, layerLabCopyUrl, layerLabOpenUrl } from "@/lib/layerlab/editorLink";
import type {
  LayerLabClass,
  LayerLabClassSummary,
  LayerLabComment,
  LayerLabDesign,
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

export default function LayerLabPage() {
  const [status, setStatus] = useState<LayerLabStatus | null>(null);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => setStatus(await fetchLayerLabStatus()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = async () => {
    await layerLabCall("signOut").catch(() => undefined);
    await refresh();
  };

  let body: ReactNode;
  if (!status) body = <p className="layerlab-muted">Loading…</p>;
  else if (!status.enabled) body = <SetupNeeded />;
  else if (status.role === "teacher") body = <TeacherView storeEnabled={status.storeEnabled} onNotice={setNotice} />;
  else if (status.role === "student" && status.student) body = <StudentView status={status} onNotice={setNotice} />;
  else body = <SignIn onSignedIn={refresh} onNotice={setNotice} />;

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

function SignIn({ onSignedIn, onNotice }: { onSignedIn: () => Promise<void>; onNotice: (text: string) => void }) {
  const [code, setCode] = useState("");
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
        <p className="layerlab-muted">The password is the one set for this server.</p>
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

function TeacherView({ storeEnabled, onNotice }: { storeEnabled: boolean; onNotice: (text: string) => void }) {
  const [classes, setClasses] = useState<LayerLabClassSummary[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LayerLabClass | null>(null);
  const [designs, setDesigns] = useState<Record<string, LayerLabDesign[]>>({});
  const [tab, setTab] = useState<"students" | "tutorials">("students");
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<Selected>(null);

  const fail = useCallback((error: unknown) => onNotice((error as Error).message), [onNotice]);

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
                <small>{entry.students} students</small>
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
              <small className="layerlab-muted">joined {when(student.joinedAt)} · {work.length} designs</small>
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
      event.currentTarget?.reset();
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
  return (
    <>
      <Paragraphs text={tutorial.body} />
      <div className="layerlab-row">
        {tutorial.link ? <a className="layerlab-button" href={tutorial.link} target="_blank" rel="noreferrer noopener">Open the video or page</a> : null}
        {starter ? <span className="layerlab-muted">Starter: {starter.title}</span> : null}
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

function StudentView({ status, onNotice }: { status: LayerLabStatus; onNotice: (text: string) => void }) {
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
        <p className="layerlab-muted">Everything you design in layerling is saved for your class, and your teacher can see it. Click a design to read your teacher&apos;s comments.</p>
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
            <article key={tutorial.id} className="layerlab-tutorial">
              <h3>{tutorial.title}</h3>
              <TutorialBody tutorial={tutorial} current={current} action={tutorial.starterId ? startButton(tutorial.starterId) : null} />
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
