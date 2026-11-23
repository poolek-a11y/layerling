import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { inspectLylProjectPackage, LYL_LIMITS, LYL_MEDIA_TYPE, withLylProjectName } from "@/lib/lylProject";
import { originMatchesRequest } from "@/lib/sameOrigin";
import { checkAttempts, clearAttempts, failedAttempt } from "@/lib/layerlab/attempts";
import { GOOGLE_PENDING_COOKIE, googleConfig, pendingFromRequest } from "@/lib/layerlab/google";
import { placeGoogleStudent } from "@/lib/layerlab/googleJoin";
import {
  hashPin,
  plainCookie,
  layerLabEnabled,
  pinMatches,
  sessionCookie,
  sessionFromRequest,
  teacherPasswordMatches,
  type LayerLabSession,
} from "@/lib/layerlab/session";
import {
  addComment,
  addStarter,
  addStudent,
  classByCode,
  cleanText,
  createClass,
  deleteClass,
  deleteComment,
  deleteStarter,
  deleteTutorial,
  designFilePath,
  designThumbnailPath,
  findStudent,
  freeDesignFileName,
  getClass,
  iterationFile,
  LayerLabError,
  listClasses,
  listComments,
  listIterations,
  listStudentDesigns,
  newClassJoinCode,
  readStarter,
  recordIteration,
  removeStudent,
  renameClass,
  sameName,
  saveTutorial,
  setStudentPin,
  sharedStoreRoot,
  writeStudentDesign,
} from "@/lib/layerlab/store";
import type { LayerLabStatus } from "@/lib/layerlab/types";

/**
 * LayerLab, the classroom: one route for the page. Reads that return a file are GETs (`?get=`), so
 * the editor can open them by URL; everything else is a JSON POST with an `action`.
 */

export const runtime = "nodejs";
export const revalidate = false;

const NO_STORE = { "Cache-Control": "no-store" };

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/* ---------- who may do what ---------- */

function requireTeacher(session: LayerLabSession | null) {
  if (session?.role !== "teacher") throw new LayerLabError("Sign in as the teacher first", 401);
}

/** The teacher, or the student whose work it is. */
function requireOwnerOrTeacher(session: LayerLabSession | null, classId: string, studentId: string) {
  if (session?.role === "teacher") return;
  if (session?.role === "student" && session.classId === classId && session.studentId === studentId) return;
  throw new LayerLabError("That is not yours to open", 403);
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

function failure(error: unknown) {
  if (error instanceof LayerLabError) return json({ error: error.message }, { status: error.status });
  console.error("layerlab:", error);
  return json({ error: error instanceof Error ? error.message : "Something went wrong" }, { status: 500 });
}

function disabled() {
  return json({ error: "LayerLab is not switched on for this server" }, { status: 404 });
}

async function googleStatus(request: Request): Promise<LayerLabStatus["google"]> {
  if (!googleConfig()) return { enabled: false };
  const pending = pendingFromRequest(request);
  if (!pending) return { enabled: true };
  const placed = await placeGoogleStudent(pending).catch(() => null);
  const classes = placed && "needs" in placed && placed.needs === "pick" ? placed.classes : [];
  return { enabled: true, pending: { name: pending.givenName, classes } };
}

async function status(request: Request): Promise<LayerLabStatus> {
  const base: LayerLabStatus = { enabled: layerLabEnabled(), storeEnabled: Boolean(sharedStoreRoot()), role: null };
  if (!base.enabled) return base;
  base.google = await googleStatus(request);
  const session = sessionFromRequest(request);
  if (!session) return base;
  if (session.role === "teacher") return { ...base, role: "teacher" };
  try {
    const { stored, student } = await findStudent(session.classId, session.studentId);
    return { ...base, role: "student", student: { classId: stored.id, className: stored.name, studentId: student.id, name: student.name } };
  } catch {
    return base;
  }
}

/* ---------- files ---------- */

async function fileResponse(file: string | null, type: string, downloadName?: string) {
  if (!file) return json({ error: "Not found" }, { status: 404 });
  const bytes = await fs.readFile(file).catch(() => null);
  if (!bytes) return json({ error: "Not found" }, { status: 404 });
  const headers: Record<string, string> = { ...NO_STORE, "Content-Type": type };
  if (downloadName) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  return new NextResponse(new Uint8Array(bytes), { headers });
}

export async function GET(request: Request) {
  if (!layerLabEnabled()) return disabled();
  try {
    const url = new URL(request.url);
    const session = sessionFromRequest(request);
    const what = url.searchParams.get("get");
    const classId = url.searchParams.get("class") ?? "";
    const studentId = url.searchParams.get("student") ?? "";
    const key = url.searchParams.get("key") ?? "";
    const iterationId = url.searchParams.get("iteration") ?? "";
    const baseName = key.split("/").pop() ?? "design.lyl";

    if (what === "starter") {
      const starterId = url.searchParams.get("starter") ?? "";
      if (session?.role !== "teacher" && !(session?.role === "student" && session.classId === classId)) {
        throw new LayerLabError("Join the class first", 403);
      }
      const { starter, bytes } = await readStarter(classId, starterId);
      return new NextResponse(new Uint8Array(bytes), {
        headers: { ...NO_STORE, "Content-Type": LYL_MEDIA_TYPE, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${starter.title}.lyl`)}` },
      });
    }

    requireOwnerOrTeacher(session, classId, studentId);
    if (what === "design") return fileResponse(designFilePath(classId, studentId, key), LYL_MEDIA_TYPE, baseName);
    if (what === "designThumbnail") return fileResponse(await designThumbnailPath(classId, studentId, key), "image/png");
    if (what === "iteration") return fileResponse(await iterationFile(classId, studentId, key, iterationId, "lyl"), LYL_MEDIA_TYPE, baseName);
    if (what === "iterationThumbnail") return fileResponse(await iterationFile(classId, studentId, key, iterationId, "png"), "image/png");
    throw new LayerLabError("Unknown request");
  } catch (error) {
    return failure(error);
  }
}

/* ---------- actions ---------- */

async function teacherAction(action: string, body: Record<string, unknown>) {
  const classId = stringField(body.classId);
  const studentId = stringField(body.studentId);
  switch (action) {
    case "listClasses":
      return { classes: await listClasses() };
    case "createClass":
      return { class: await createClass(body.name) };
    case "renameClass":
      return { class: await renameClass(classId, body.name) };
    case "newJoinCode":
      return { class: await newClassJoinCode(classId) };
    case "deleteClass":
      await deleteClass(classId);
      return { ok: true };
    case "getClass": {
      const found = await getClass(classId);
      const designs = await Promise.all(found.students.map(async (student) => [student.id, await listStudentDesigns(classId, student.id)] as const));
      return { class: found, designs: Object.fromEntries(designs) };
    }
    case "removeStudent":
      return { class: await removeStudent(classId, studentId) };
    case "resetPin": {
      const pin = stringField(body.pin).trim();
      if (!/^\d{4,8}$/.test(pin)) throw new LayerLabError("A PIN is 4 to 8 digits");
      await setStudentPin(classId, studentId, hashPin(pin));
      return { ok: true };
    }
    case "saveTutorial":
      return { class: await saveTutorial(classId, (body.tutorial ?? {}) as Record<string, unknown>) };
    case "deleteTutorial":
      return { class: await deleteTutorial(classId, stringField(body.tutorialId)) };
    case "deleteStarter":
      return { class: await deleteStarter(classId, stringField(body.starterId)) };
    case "deleteComment":
      return { comments: await deleteComment(classId, studentId, stringField(body.key), stringField(body.commentId)) };
    default:
      return undefined;
  }
}

async function addStarterFromForm(request: Request, session: LayerLabSession | null) {
  requireTeacher(session);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > LYL_LIMITS.archiveBytes + 1024 * 1024) throw new LayerLabError("That file is too large", 413);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new LayerLabError("Choose a .lyl file saved from layerling");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let projectName = "";
  try {
    projectName = (await inspectLylProjectPackage(bytes)).projectName;
  } catch {
    throw new LayerLabError("That is not a layerling project. In the editor, use Save as file (.lyl) and choose that file.");
  }
  const title = stringField(form.get("title")).trim() || projectName;
  return json({ class: await addStarter(stringField(form.get("classId")), title, bytes) });
}

export async function POST(request: Request) {
  if (!layerLabEnabled()) return disabled();
  if (!originMatchesRequest(request)) return json({ error: "LayerLab only accepts requests from this site" }, { status: 403 });
  try {
    const session = sessionFromRequest(request);
    if (request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      return await addStarterFromForm(request, session);
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = stringField(body.action);

    if (action === "status") return json(await status(request));

    if (action === "signOut") {
      const response = json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, null) } });
      response.headers.append("Set-Cookie", plainCookie(request, GOOGLE_PENDING_COOKIE, null, 0));
      return response;
    }

    if (action === "googleContinue") {
      const pending = pendingFromRequest(request);
      if (!pending) throw new LayerLabError("Your Google sign-in timed out. Sign in with Google again.", 401);
      const placed = await placeGoogleStudent(pending, {
        code: stringField(body.code) || undefined,
        classId: stringField(body.classId) || undefined,
        pin: stringField(body.pin) || undefined,
        asNew: body.asNew === true,
      });
      if (!("session" in placed)) return json(placed);
      const response = json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, placed.session) } });
      response.headers.append("Set-Cookie", plainCookie(request, GOOGLE_PENDING_COOKIE, null, 0));
      return response;
    }

    if (action === "teacherSignIn") {
      const key = `teacher:${clientAddress(request)}`;
      checkAttempts(key);
      if (!teacherPasswordMatches(stringField(body.password))) {
        failedAttempt(key);
        throw new LayerLabError("That password is not right", 401);
      }
      clearAttempts(key);
      const cookie = sessionCookie(request, { role: "teacher", issuedAt: Date.now() });
      return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
    }

    if (action === "studentJoin") {
      if (!sharedStoreRoot()) throw new LayerLabError("The server has no folder for student work yet. Ask your teacher.", 503);
      const stored = await classByCode(body.code);
      const name = cleanText(body.name, 40, "Your name");
      const pin = stringField(body.pin).trim();
      if (!/^\d{4,8}$/.test(pin)) throw new LayerLabError("Your PIN is 4 to 8 digits");
      const key = `student:${stored.id}:${name.toLowerCase()}`;
      checkAttempts(key);
      let student = stored.students.find((entry) => sameName(entry.name, name));
      if (student) {
        if (!pinMatches(pin, student.pinHash)) {
          failedAttempt(key);
          throw new LayerLabError("That name is in this class already and the PIN does not match. Ask your teacher to reset it.", 401);
        }
        clearAttempts(key);
      } else if (body.create === true) {
        student = await addStudent(stored.id, name, hashPin(pin));
      } else {
        // The page asks once before a new name joins, so a typo does not quietly make a second student.
        return json({ needsConfirm: true, className: stored.name });
      }
      const cookie = sessionCookie(request, { role: "student", classId: stored.id, studentId: student.id, issuedAt: Date.now() });
      return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
    }

    if (!session) throw new LayerLabError("Sign in first", 401);

    if (session.role === "teacher") {
      const answer = await teacherAction(action, body);
      if (answer !== undefined) return json(answer);
    }

    // What the teacher and the student may both do, the student only with their own work.
    const classId = session.role === "student" ? session.classId : stringField(body.classId);
    const studentId = session.role === "student" ? session.studentId : stringField(body.studentId);
    const key = stringField(body.key);

    switch (action) {
      case "myClass": {
        if (session.role !== "student") throw new LayerLabError("Only for students");
        const found = await getClass(classId);
        return json({ class: { ...found, students: [] }, designs: await listStudentDesigns(classId, studentId) });
      }
      case "design": {
        requireOwnerOrTeacher(session, classId, studentId);
        const { student } = await findStudent(classId, studentId);
        return json({
          student,
          iterations: await listIterations(classId, studentId, key),
          comments: await listComments(classId, studentId, key),
        });
      }
      case "addComment": {
        requireOwnerOrTeacher(session, classId, studentId);
        const { student } = await findStudent(classId, studentId);
        const comments = await addComment(classId, studentId, key, {
          author: session.role,
          authorName: session.role === "teacher" ? "Teacher" : student.name,
          text: body.text,
          iterationId: body.iterationId,
        });
        return json({ comments });
      }
      case "startFromStarter": {
        if (session.role !== "student") throw new LayerLabError("Only for students");
        const { starter, bytes } = await readStarter(classId, stringField(body.starterId));
        const fileName = await freeDesignFileName(classId, studentId, starter.title);
        const named = await withLylProjectName(bytes, fileName.replace(/\.lyl$/, ""));
        await writeStudentDesign(classId, studentId, fileName, named);
        await recordIteration(classId, studentId, fileName, named, null, { source: "starter", starterTitle: starter.title });
        return json({ path: "", fileName });
      }
      default:
        throw new LayerLabError("Unknown request");
    }
  } catch (error) {
    return failure(error);
  }
}
