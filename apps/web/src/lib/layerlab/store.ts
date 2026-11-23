import { createHash, randomBytes } from "crypto";
import { isLessonId } from "@/lib/lessons/catalog";
import { promises as fs } from "fs";
import path from "path";
import { studentStoreFolder } from "@/lib/layerlab/session";
import type {
  LayerLabClass,
  LayerLabClassSummary,
  LayerLabComment,
  LayerLabDesign,
  LayerLabIteration,
  LayerLabStarter,
  LayerLabStudent,
  LayerLabTutorial,
} from "@/lib/layerlab/types";

/**
 * Where LayerLab keeps its classes, iterations, comments and starters: a `.layerlab` folder in the
 * root of the shared store (`LAYERLING_SHARED_PROJECTS_DIR`). The dot keeps it out of every listing
 * and out of reach of a store path, which refuses names that start with one. A student's designs
 * are not in here - they stay ordinary shared projects in `.users/layerlab-<class>-<student>`, so
 * the editor opens and saves them the way it always has.
 *
 *   .layerlab/classes/<class>.json                   the class, its students, tutorials and starters
 *   .layerlab/starters/<class>/<starter>.lyl         the files students begin from
 *   .layerlab/iterations/<class>/<student>/<hash>/   index.json plus <iteration>.lyl / .png
 *   .layerlab/comments/<class>/<student>.json        comments by design key
 */

const SHARED_PROJECTS_ENV = "LAYERLING_SHARED_PROJECTS_DIR";
const DATA_FOLDER = ".layerlab";
/** Saves closer together than this replace the last iteration instead of adding one: the editor saves on its own every few seconds. */
export const ITERATION_MERGE_MS = 3 * 60 * 1000;
export const ITERATION_LIMIT = 500;
const COMMENT_LIMIT = 4000;
const NAME_LIMIT = 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class LayerLabError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function sharedStoreRoot(env: Record<string, string | undefined> = process.env) {
  const configured = env[SHARED_PROJECTS_ENV]?.trim();
  return configured ? path.resolve(configured) : null;
}

function dataRoot() {
  const root = sharedStoreRoot();
  if (!root) throw new LayerLabError(`LayerLab keeps student work on the server: set ${SHARED_PROJECTS_ENV} first.`, 503);
  return path.join(root, DATA_FOLDER);
}

export function newId() {
  return randomBytes(8).toString("hex");
}

function newClassCode() {
  const bytes = randomBytes(6);
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

const ID_PATTERN = /^[a-z0-9]{6,32}$/;
function checkId(id: unknown, what: string): string {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new LayerLabError(`Unknown ${what}`, 404);
  return id;
}

export function cleanText(value: unknown, limit: number, what: string, required = true) {
  const text = typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
  if (required && !text) throw new LayerLabError(`${what} is required`);
  if (text.length > limit) throw new LayerLabError(`${what} is too long (at most ${limit} characters)`);
  return text;
}

/* ---------- small file helpers ---------- */

const queues = new Map<string, Promise<unknown>>();
/** One write at a time per file within this server; enough for a single classroom container. */
function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(work, work);
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeAtomic(file: string, data: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${newId()}.tmp`;
  await fs.writeFile(temporary, data);
  await fs.rename(temporary, file);
}

function updateJson<T>(file: string, fallback: T, change: (value: T) => T | Promise<T>) {
  return serialized(file, async () => {
    const next = await change(await readJson(file, fallback));
    await writeAtomic(file, JSON.stringify(next, null, 1));
    return next;
  });
}

/* ---------- classes ---------- */

/** `pinHash` is empty for a student who only signs in with Google; `googleId` is set once they have. */
type StoredStudent = Omit<LayerLabStudent, "google"> & { pinHash: string; googleId?: string };
type StoredClass = Omit<LayerLabClass, "students" | "starters"> & {
  students: StoredStudent[];
  starters: Array<Omit<LayerLabStarter, "size">>;
};

const classFile = (classId: string) => path.join(dataRoot(), "classes", `${checkId(classId, "class")}.json`);
const starterFile = (classId: string, starterId: string) =>
  path.join(dataRoot(), "starters", checkId(classId, "class"), `${checkId(starterId, "starter")}.lyl`);

async function readClass(classId: string): Promise<StoredClass> {
  const stored = await readJson<StoredClass | null>(classFile(classId), null);
  if (!stored) throw new LayerLabError("That class does not exist", 404);
  return stored;
}

function changeClass(classId: string, change: (stored: StoredClass) => StoredClass | Promise<StoredClass>) {
  return updateJson<StoredClass | null>(classFile(classId), null, (stored) => {
    if (!stored) throw new LayerLabError("That class does not exist", 404);
    return change(stored);
  }) as Promise<StoredClass>;
}

async function publicClass(stored: StoredClass): Promise<LayerLabClass> {
  const starters = await Promise.all(stored.starters.map(async (starter) => ({
    ...starter,
    size: (await fs.stat(starterFile(stored.id, starter.id)).catch(() => null))?.size ?? 0,
  })));
  return {
    ...stored,
    students: stored.students.map(({ id, name, joinedAt, googleId }) => ({ id, name, joinedAt, ...(googleId ? { google: true } : {}) })),
    starters,
  };
}

export async function listClasses(): Promise<LayerLabClassSummary[]> {
  const folder = path.join(dataRoot(), "classes");
  const files = (await fs.readdir(folder).catch(() => [] as string[])).filter((name) => name.endsWith(".json"));
  const classes = await Promise.all(files.map((name) => readJson<StoredClass | null>(path.join(folder, name), null)));
  return classes
    .filter((stored): stored is StoredClass => Boolean(stored))
    .map(({ id, name, code, createdAt, students }) => ({ id, name, code, createdAt, students: students.length }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getClass(classId: string) {
  return publicClass(await readClass(classId));
}

export async function createClass(name: unknown) {
  const className = cleanText(name, NAME_LIMIT, "The class name");
  const taken = new Set((await listClasses()).map((entry) => entry.code));
  let code = newClassCode();
  while (taken.has(code)) code = newClassCode();
  const stored: StoredClass = { id: newId(), name: className, code, createdAt: Date.now(), students: [], tutorials: [], starters: [] };
  await updateJson<StoredClass | null>(classFile(stored.id), null, () => stored);
  return publicClass(stored);
}

export async function renameClass(classId: string, name: unknown) {
  const className = cleanText(name, NAME_LIMIT, "The class name");
  return publicClass(await changeClass(classId, (stored) => ({ ...stored, name: className })));
}

export async function newClassJoinCode(classId: string) {
  const taken = new Set((await listClasses()).map((entry) => entry.code));
  let code = newClassCode();
  while (taken.has(code)) code = newClassCode();
  return publicClass(await changeClass(classId, (stored) => ({ ...stored, code })));
}

/** The class with its data. The students' designs stay in the store, so nothing a student made is lost by accident. */
export async function deleteClass(classId: string) {
  await serialized(classFile(classId), () => fs.unlink(classFile(classId)).catch(() => undefined));
}

export async function classByCode(code: unknown) {
  const wanted = typeof code === "string" ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (!wanted) throw new LayerLabError("Type the class code your teacher gave you");
  const match = (await listClasses()).find((entry) => entry.code === wanted);
  if (!match) throw new LayerLabError("There is no class with that code", 404);
  return readClass(match.id);
}

/* ---------- students ---------- */

export async function findStudent(classId: string, studentId: string) {
  const stored = await readClass(classId);
  const student = stored.students.find((entry) => entry.id === studentId);
  if (!student) throw new LayerLabError("That student is not in this class", 404);
  return { stored, student };
}

export function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function addStudent(classId: string, name: string, pinHash: string) {
  let added: StoredStudent | null = null;
  await changeClass(classId, (stored) => {
    if (stored.students.some((student) => sameName(student.name, name))) throw new LayerLabError("That name is taken in this class", 409);
    added = { id: newId(), name, pinHash, joinedAt: Date.now() };
    return { ...stored, students: [...stored.students, added] };
  });
  return added as unknown as StoredStudent;
}

/** A free name for a student joining with Google: "Sam", then "Sam K.", then "Sam K. 2". */
function freeName(stored: StoredClass, givenName: string, familyInitial: string) {
  const taken = (name: string) => stored.students.some((student) => sameName(student.name, name));
  if (!taken(givenName)) return givenName;
  const withInitial = familyInitial ? `${givenName} ${familyInitial}.` : givenName;
  if (!taken(withInitial)) return withInitial;
  for (let index = 2; ; index += 1) {
    if (!taken(`${withInitial} ${index}`)) return `${withInitial} ${index}`;
  }
}

export async function addGoogleStudent(classId: string, givenName: string, familyInitial: string, googleId: string) {
  let added: StoredStudent | null = null;
  await changeClass(classId, (stored) => {
    const existing = stored.students.find((student) => student.googleId === googleId);
    if (existing) {
      added = existing;
      return stored;
    }
    added = { id: newId(), name: freeName(stored, givenName, familyInitial), pinHash: "", googleId, joinedAt: Date.now() };
    return { ...stored, students: [...stored.students, added] };
  });
  return added as unknown as StoredStudent;
}

/** A student who joined with a PIN signs in with Google from now on (the PIN keeps working). */
export async function linkGoogle(classId: string, studentId: string, googleId: string) {
  await changeClass(classId, (stored) => ({
    ...stored,
    students: stored.students.map((student) => (student.id === studentId ? { ...student, googleId } : student)),
  }));
}

/** Every class this Google account is a student in. */
export async function classesOfGoogleStudent(googleId: string) {
  const folder = path.join(dataRoot(), "classes");
  const files = (await fs.readdir(folder).catch(() => [] as string[])).filter((name) => name.endsWith(".json"));
  const classes = await Promise.all(files.map((name) => readJson<StoredClass | null>(path.join(folder, name), null)));
  return classes
    .filter((stored): stored is StoredClass => Boolean(stored))
    .flatMap((stored) => stored.students
      .filter((student) => student.googleId === googleId)
      .map((student) => ({ classId: stored.id, className: stored.name, studentId: student.id, createdAt: stored.createdAt })))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function setStudentPin(classId: string, studentId: string, pinHash: string) {
  await changeClass(classId, (stored) => {
    if (!stored.students.some((student) => student.id === studentId)) throw new LayerLabError("That student is not in this class", 404);
    return { ...stored, students: stored.students.map((student) => (student.id === studentId ? { ...student, pinHash } : student)) };
  });
}

/** Takes the student off the list; their designs and iterations stay on disk. */
export async function removeStudent(classId: string, studentId: string) {
  return publicClass(await changeClass(classId, (stored) => ({ ...stored, students: stored.students.filter((student) => student.id !== studentId) })));
}

/* ---------- tutorials and starters ---------- */

const TUTORIAL_BODY_LIMIT = 20000;

function cleanLink(value: unknown) {
  const link = cleanText(value, 2000, "The link", false);
  if (!link) return undefined;
  try {
    const url = new URL(link);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    // fall through
  }
  throw new LayerLabError("The link must start with https://");
}

function cleanTutorial(input: Record<string, unknown>, stored: StoredClass) {
  const starterId = typeof input.starterId === "string" && input.starterId ? input.starterId : undefined;
  if (starterId && !stored.starters.some((starter) => starter.id === starterId)) throw new LayerLabError("That starter is gone", 404);
  return {
    title: cleanText(input.title, 120, "The title"),
    body: cleanText(input.body, TUTORIAL_BODY_LIMIT, "The text", false),
    link: cleanLink(input.link),
    starterId,
    lessonId: isLessonId(input.lessonId) ? input.lessonId : undefined,
  };
}

export async function saveTutorial(classId: string, input: Record<string, unknown>) {
  return publicClass(await changeClass(classId, (stored) => {
    const fields = cleanTutorial(input, stored);
    const tutorialId = typeof input.id === "string" ? input.id : "";
    if (tutorialId) {
      if (!stored.tutorials.some((tutorial) => tutorial.id === tutorialId)) throw new LayerLabError("That tutorial is gone", 404);
      return { ...stored, tutorials: stored.tutorials.map((tutorial) => (tutorial.id === tutorialId ? { ...tutorial, ...fields } : tutorial)) };
    }
    const tutorial: LayerLabTutorial = { id: newId(), createdAt: Date.now(), ...fields };
    return { ...stored, tutorials: [...stored.tutorials, tutorial] };
  }));
}

export async function deleteTutorial(classId: string, tutorialId: string) {
  return publicClass(await changeClass(classId, (stored) => ({ ...stored, tutorials: stored.tutorials.filter((tutorial) => tutorial.id !== tutorialId) })));
}

/** `bytes` must already be a checked .lyl package. */
export async function addStarter(classId: string, title: unknown, bytes: Uint8Array) {
  const starterTitle = cleanText(title, 120, "The starter's name");
  const id = newId();
  await readClass(classId);
  await writeAtomic(starterFile(classId, id), bytes);
  return publicClass(await changeClass(classId, (stored) => ({
    ...stored,
    starters: [...stored.starters, { id, title: starterTitle, createdAt: Date.now() }],
  })));
}

export async function deleteStarter(classId: string, starterId: string) {
  const updated = await changeClass(classId, (stored) => ({
    ...stored,
    starters: stored.starters.filter((starter) => starter.id !== starterId),
    tutorials: stored.tutorials.map((tutorial) => (tutorial.starterId === starterId ? { ...tutorial, starterId: undefined } : tutorial)),
  }));
  await fs.unlink(starterFile(classId, starterId)).catch(() => undefined);
  return publicClass(updated);
}

export async function readStarter(classId: string, starterId: string) {
  const stored = await readClass(classId);
  const starter = stored.starters.find((entry) => entry.id === starterId);
  if (!starter) throw new LayerLabError("That starter is gone", 404);
  return { starter, bytes: new Uint8Array(await fs.readFile(starterFile(classId, starterId))) };
}

/* ---------- a student's designs ---------- */

export function studentStoreRoot(classId: string, studentId: string) {
  const root = sharedStoreRoot();
  if (!root) throw new LayerLabError(`Set ${SHARED_PROJECTS_ENV} first`, 503);
  return path.join(root, ".users", studentStoreFolder(checkId(classId, "class"), checkId(studentId, "student")));
}

const DESIGN_FILE = /\.(lyl|skf)$/i;

/** A design key from the browser, made safe: segments without dots in front, ending in .lyl or .skf. */
export function checkDesignKey(key: unknown) {
  const value = typeof key === "string" ? key.replace(/\\/g, "/").replace(/^\/+/, "") : "";
  const segments = value.split("/");
  if (!value || !DESIGN_FILE.test(value) || segments.some((segment) => !segment || segment.startsWith(".") || segment.length > 200)) {
    throw new LayerLabError("Unknown design", 404);
  }
  return segments.join("/");
}

export function designKey(folderPath: string, fileName: string) {
  return folderPath ? `${folderPath}/${fileName}` : fileName;
}

export function designFilePath(classId: string, studentId: string, key: string) {
  return path.join(studentStoreRoot(classId, studentId), ...checkDesignKey(key).split("/"));
}

/** The picture the editor stored with the latest save; named by the file's revision, as the shared route does. */
export async function designThumbnailPath(classId: string, studentId: string, key: string) {
  const file = designFilePath(classId, studentId, key);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) return null;
  const revision = `${stat.size.toString(16)}-${Math.round(stat.mtimeMs * 1000).toString(16)}`;
  const thumbnail = path.join(path.dirname(file), ".thumbnails", `${path.basename(file)}.${revision}.png`);
  return (await fs.stat(thumbnail).catch(() => null)) ? thumbnail : null;
}

async function walkDesigns(root: string, folder: string, depth: number, found: Array<{ key: string; size: number; updatedAt: number }>) {
  if (depth > 10 || found.length > 1000) return;
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) await walkDesigns(root, full, depth + 1, found);
    else if (entry.isFile() && DESIGN_FILE.test(entry.name)) {
      const stat = await fs.stat(full);
      found.push({ key: path.relative(root, full).split(path.sep).join("/"), size: stat.size, updatedAt: stat.mtimeMs });
    }
  }
}

export async function listStudentDesigns(classId: string, studentId: string): Promise<LayerLabDesign[]> {
  const root = studentStoreRoot(classId, studentId);
  const found: Array<{ key: string; size: number; updatedAt: number }> = [];
  await walkDesigns(root, root, 0, found);
  const comments = await readComments(classId, studentId);
  const designs = await Promise.all(found.map(async (design) => {
    const index = await readIterationIndex(classId, studentId, design.key);
    const starter = index.iterations.find((iteration) => iteration.source === "starter");
    return {
      ...design,
      name: path.posix.basename(design.key).replace(DESIGN_FILE, ""),
      iterations: index.iterations.length,
      comments: comments[design.key]?.length ?? 0,
      ...(starter?.starterTitle ? { starterTitle: starter.starterTitle } : {}),
    };
  }));
  return designs.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A free file name in the root of the student's folder, for a starter they begin from. */
export async function freeDesignFileName(classId: string, studentId: string, title: string) {
  const root = studentStoreRoot(classId, studentId);
  const stem = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 100) || "Starter";
  for (let index = 1; index < 1000; index += 1) {
    const fileName = index === 1 ? `${stem}.lyl` : `${stem} ${index}.lyl`;
    if (!(await fs.stat(path.join(root, fileName)).catch(() => null))) return fileName;
  }
  throw new LayerLabError("Too many copies of this starter");
}

export async function writeStudentDesign(classId: string, studentId: string, fileName: string, bytes: Uint8Array) {
  const file = designFilePath(classId, studentId, fileName);
  await writeAtomic(file, bytes);
}

/* ---------- iterations ---------- */

type IterationIndex = { key: string; iterations: LayerLabIteration[] };

function iterationFolder(classId: string, studentId: string, key: string) {
  const hash = createHash("sha256").update(checkDesignKey(key)).digest("hex").slice(0, 32);
  return path.join(dataRoot(), "iterations", checkId(classId, "class"), checkId(studentId, "student"), hash);
}

async function readIterationIndex(classId: string, studentId: string, key: string): Promise<IterationIndex> {
  return readJson<IterationIndex>(path.join(iterationFolder(classId, studentId, key), "index.json"), { key, iterations: [] });
}

export async function listIterations(classId: string, studentId: string, key: string) {
  return (await readIterationIndex(classId, studentId, key)).iterations.slice().sort((a, b) => b.savedAt - a.savedAt);
}

export async function iterationFile(classId: string, studentId: string, key: string, iterationId: string, kind: "lyl" | "png") {
  const folder = iterationFolder(classId, studentId, key);
  return path.join(folder, `${checkId(iterationId, "iteration")}.${kind}`);
}

/**
 * Keeps a copy of what a student just saved. The editor saves by itself every few seconds, so a
 * save within ITERATION_MERGE_MS of the last one replaces that copy: the history then holds one
 * state for every few minutes of work, which is what a teacher wants to step through.
 */
export async function recordIteration(
  classId: string,
  studentId: string,
  key: string,
  bytes: Uint8Array,
  thumbnail: Uint8Array | null,
  options: { now?: number; source?: "starter"; starterTitle?: string } = {},
) {
  const folder = iterationFolder(classId, studentId, key);
  const indexFile = path.join(folder, "index.json");
  const now = options.now ?? Date.now();
  return updateJson<IterationIndex>(indexFile, { key, iterations: [] }, async (index) => {
    const iterations = index.iterations.slice();
    const last = iterations[iterations.length - 1];
    const merge = !options.source && last && !last.source && now - last.savedAt < ITERATION_MERGE_MS;
    const entry: LayerLabIteration = merge
      ? { ...last, savedAt: now, size: bytes.byteLength, hasThumbnail: Boolean(thumbnail) || last.hasThumbnail }
      : {
        id: newId(),
        savedAt: now,
        size: bytes.byteLength,
        hasThumbnail: Boolean(thumbnail),
        ...(options.source ? { source: options.source } : {}),
        ...(options.starterTitle ? { starterTitle: options.starterTitle } : {}),
      };
    await writeAtomic(path.join(folder, `${entry.id}.lyl`), bytes);
    if (thumbnail) await writeAtomic(path.join(folder, `${entry.id}.png`), thumbnail);
    if (merge) iterations[iterations.length - 1] = entry;
    else iterations.push(entry);
    // The oldest go first, but never the starter: where a piece of work began is the point of the history.
    while (iterations.length > ITERATION_LIMIT) {
      const dropAt = iterations.findIndex((iteration) => !iteration.source);
      const [dropped] = iterations.splice(dropAt < 0 ? 0 : dropAt, 1);
      await fs.unlink(path.join(folder, `${dropped.id}.lyl`)).catch(() => undefined);
      await fs.unlink(path.join(folder, `${dropped.id}.png`)).catch(() => undefined);
    }
    return { key, iterations };
  });
}

/** A design renamed or moved in the editor keeps its history and its comments. */
export async function moveDesignHistory(classId: string, studentId: string, fromKey: string, toKey: string) {
  if (fromKey === toKey) return;
  const from = iterationFolder(classId, studentId, fromKey);
  const to = iterationFolder(classId, studentId, toKey);
  if (await fs.stat(from).catch(() => null)) {
    if (!(await fs.stat(to).catch(() => null))) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
      await updateJson<IterationIndex>(path.join(to, "index.json"), { key: toKey, iterations: [] }, (index) => ({ ...index, key: toKey }));
    }
  }
  await updateJson<Record<string, LayerLabComment[]>>(commentsFile(classId, studentId), {}, (all) => {
    if (!all[fromKey] || all[toKey]) return all;
    const { [fromKey]: moved, ...rest } = all;
    return { ...rest, [toKey]: moved };
  });
}

/* ---------- comments ---------- */

function commentsFile(classId: string, studentId: string) {
  return path.join(dataRoot(), "comments", checkId(classId, "class"), `${checkId(studentId, "student")}.json`);
}

async function readComments(classId: string, studentId: string) {
  return readJson<Record<string, LayerLabComment[]>>(commentsFile(classId, studentId), {});
}

export async function listComments(classId: string, studentId: string, key: string) {
  return (await readComments(classId, studentId))[checkDesignKey(key)] ?? [];
}

export async function addComment(
  classId: string,
  studentId: string,
  key: string,
  comment: { author: "teacher" | "student"; authorName: string; text: unknown; iterationId?: unknown },
) {
  const designKeyChecked = checkDesignKey(key);
  const text = cleanText(comment.text, COMMENT_LIMIT, "The comment");
  const iterationId = typeof comment.iterationId === "string" && ID_PATTERN.test(comment.iterationId) ? comment.iterationId : undefined;
  const entry: LayerLabComment = {
    id: newId(),
    author: comment.author,
    authorName: comment.authorName,
    text,
    createdAt: Date.now(),
    ...(iterationId ? { iterationId } : {}),
  };
  const all = await updateJson<Record<string, LayerLabComment[]>>(commentsFile(classId, studentId), {}, (current) => ({
    ...current,
    [designKeyChecked]: [...(current[designKeyChecked] ?? []), entry],
  }));
  return all[designKeyChecked];
}

export async function deleteComment(classId: string, studentId: string, key: string, commentId: string) {
  const designKeyChecked = checkDesignKey(key);
  const all = await updateJson<Record<string, LayerLabComment[]>>(commentsFile(classId, studentId), {}, (current) => ({
    ...current,
    [designKeyChecked]: (current[designKeyChecked] ?? []).filter((comment) => comment.id !== commentId),
  }));
  return all[designKeyChecked];
}
