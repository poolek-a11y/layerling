import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as layerLabGet, POST as layerLabPost } from "@/app/api/layerlab/route";
import { GET as googleGet } from "@/app/api/layerlab/google/route";
import { classPageUrl, classroomShareUrl, designPageUrl, readLayerLabPageLink } from "@/lib/layerlab/classroomShare";
import { GET as sharedGet, POST as sharedPost } from "@/app/api/shared-projects/route";
import { POST as serverDefaultsPost } from "@/app/api/server-defaults/route";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { readLayerLabOpenRequest, withoutLayerLabOpenRequest } from "@/lib/layerlab/editorLink";
import { decodeSession, encodeSession, layerLabUserFolder } from "@/lib/layerlab/session";
import { ITERATION_MERGE_MS, recordIteration, listIterations } from "@/lib/layerlab/store";
import { exportLylProject, importLylProject } from "@/lib/lylProject";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";

/*
 * LayerLab, the classroom: a teacher makes a class, students join it with a code, and what they
 * save in the editor lands in a server folder of their own, each save kept as an iteration the
 * teacher can step through and comment on.
 */

const ENV = [
  "LAYERLING_SHARED_PROJECTS_DIR",
  "LAYERLAB_TEACHER_PASSWORD",
  "LAYERLAB_SECRET",
  "LAYERLAB_GOOGLE_CLIENT_ID",
  "LAYERLAB_GOOGLE_CLIENT_SECRET",
  "LAYERLAB_GOOGLE_DOMAINS",
  "LAYERLAB_TEACHER_EMAILS",
  "LAYERLAB_PUBLIC_URL",
] as const;
let previous: Record<string, string | undefined> = {};
let root = "";

async function lyl(projectName: string) {
  return exportLylProject({
    projectName,
    createdAt: 1,
    modifiedAt: 2,
    shapes: [],
    history: [editorHistoryEntry([], [])],
    historyIndex: 0,
    assets: [],
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 0,
  });
}

function cookieOf(response: Response) {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0];
}

async function call(action: string, body: Record<string, unknown> = {}, cookie = "") {
  const response = await layerLabPost(new Request("http://localhost/api/layerlab", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ action, ...body }),
  }));
  return { response, body: await response.json() as Record<string, any> };
}

async function teacherCookie() {
  const { response } = await call("teacherSignIn", { password: "chalk and cheese" });
  expect(response.status).toBe(200);
  return cookieOf(response);
}

async function joinAs(code: string, name: string, pin = "1234") {
  const first = await call("studentJoin", { code, name, pin });
  if (first.body.needsConfirm) {
    const { response } = await call("studentJoin", { code, name, pin, create: true });
    expect(response.status).toBe(200);
    return cookieOf(response);
  }
  expect(first.response.status).toBe(200);
  return cookieOf(first.response);
}

async function saveAs(cookie: string, fileName: string, bytes: Uint8Array, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("project", new Blob([bytes.slice().buffer]), fileName);
  form.append("thumbnail", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: "image/png" }), `${fileName}.png`);
  return sharedPost(new Request(`http://localhost/api/shared-projects?fileName=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: { Origin: "http://localhost", Cookie: cookie, ...extra },
    body: form,
  }));
}

describe("LayerLab", () => {
  beforeEach(async () => {
    previous = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));
    root = await fs.mkdtemp(path.join(os.tmpdir(), "layerlab-"));
    process.env.LAYERLING_SHARED_PROJECTS_DIR = root;
    process.env.LAYERLAB_TEACHER_PASSWORD = "chalk and cheese";
    for (const name of ENV.slice(2)) delete process.env[name];
  });

  afterEach(async () => {
    for (const name of ENV) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await fs.rm(root, { recursive: true, force: true });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("signs sessions so a changed cookie is refused", () => {
    const cookie = encodeSession({ role: "student", classId: "aaaaaaaa", studentId: "bbbbbbbb", issuedAt: Date.now() });
    expect(decodeSession(cookie)).toMatchObject({ role: "student", classId: "aaaaaaaa" });
    const [payload, signature] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ role: "teacher", issuedAt: Date.now() })).toString("base64url");
    expect(decodeSession(`${forged}.${signature}`)).toBeNull();
    expect(decodeSession(`${payload}.x${signature}`)).toBeNull();
    process.env.LAYERLAB_TEACHER_PASSWORD = "another password";
    expect(decodeSession(cookie)).toBeNull();
  });

  it("refuses a wrong teacher password and anything a teacher does without signing in", async () => {
    expect((await call("teacherSignIn", { password: "nope" })).response.status).toBe(401);
    expect((await call("listClasses")).response.status).toBe(401);
  });

  it("lets a student join, save into their own folder and see the teacher's comment on it", async () => {
    const teacher = await teacherCookie();
    const created = await call("createClass", { name: "Year 8 Design" }, teacher);
    const { id: classId, code } = created.body.class;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const ada = await joinAs(code.toLowerCase(), "Ada");
    const status = await call("status", {}, ada);
    expect(status.body).toMatchObject({ enabled: true, role: "student", student: { className: "Year 8 Design", name: "Ada" } });

    const saved = await saveAs(ada, "Phone stand.lyl", await lyl("Phone stand"));
    expect(saved.status).toBe(201);
    const studentId = status.body.student.studentId;
    const folder = path.join(root, ".users", `layerlab-${classId}-${studentId}`);
    await expect(fs.access(path.join(folder, "Phone stand.lyl"))).resolves.toBeUndefined();
    // Not in the store everybody else sees.
    await expect(fs.access(path.join(root, "Phone stand.lyl"))).rejects.toThrow();

    const overview = await call("getClass", { classId }, teacher);
    const [design] = overview.body.designs[studentId];
    expect(design).toMatchObject({ key: "Phone stand.lyl", name: "Phone stand", iterations: 1, comments: 0 });

    const comment = await call("addComment", { classId, studentId, key: design.key, text: "Make the lip 2 mm taller." }, teacher);
    expect(comment.body.comments).toHaveLength(1);

    const mine = await call("design", { key: design.key }, ada);
    expect(mine.body.comments[0]).toMatchObject({ author: "teacher", text: "Make the lip 2 mm taller." });
    const reply = await call("addComment", { key: design.key, text: "Done!" }, ada);
    expect(reply.body.comments[1]).toMatchObject({ author: "student", authorName: "Ada" });

    // The teacher can open the design itself, and a picture of it.
    const file = await layerLabGet(new Request(`http://localhost/api/layerlab?get=design&class=${classId}&student=${studentId}&key=${encodeURIComponent(design.key)}`, { headers: { Cookie: teacher } }));
    expect(file.status).toBe(200);
    expect((await importLylProject(await file.arrayBuffer())).projectName).toBe("Phone stand");
    const picture = await layerLabGet(new Request(`http://localhost/api/layerlab?get=designThumbnail&class=${classId}&student=${studentId}&key=${encodeURIComponent(design.key)}`, { headers: { Cookie: teacher } }));
    expect(picture.status).toBe(200);
  });

  it("keeps one student out of another's work", async () => {
    const teacher = await teacherCookie();
    const { id: classId, code } = (await call("createClass", { name: "Class" }, teacher)).body.class;
    const ada = await joinAs(code, "Ada");
    const bob = await joinAs(code, "Bob");
    await saveAs(ada, "Secret.lyl", await lyl("Secret"));
    const adaId = (await call("status", {}, ada)).body.student.studentId;

    const peek = await layerLabGet(new Request(`http://localhost/api/layerlab?get=design&class=${classId}&student=${adaId}&key=Secret.lyl`, { headers: { Cookie: bob } }));
    expect(peek.status).toBe(403);
    // Bob's own view of "Secret.lyl" is his own (empty) design, not Ada's.
    expect((await call("design", { classId, studentId: adaId, key: "Secret.lyl" }, bob)).body.comments).toEqual([]);
    expect((await call("getClass", { classId }, bob)).response.status).toBe(400);
  });

  it("asks for the PIN again and refuses a wrong one", async () => {
    const teacher = await teacherCookie();
    const { code } = (await call("createClass", { name: "Class" }, teacher)).body.class;
    await joinAs(code, "Ada", "4321");
    expect((await call("studentJoin", { code, name: "ada", pin: "0000" })).response.status).toBe(401);
    expect((await call("studentJoin", { code, name: "ADA", pin: "4321" })).response.status).toBe(200);
  });

  it("keeps a version every few minutes, not one per automatic save", async () => {
    const teacher = await teacherCookie();
    const { id: classId } = (await call("createClass", { name: "Class" }, teacher)).body.class;
    const studentId = "abcdef12";
    const bytes = await lyl("Box");
    await recordIteration(classId, studentId, "Box.lyl", bytes, null, { now: 1_000_000 });
    await recordIteration(classId, studentId, "Box.lyl", bytes, null, { now: 1_000_000 + 10_000 });
    expect(await listIterations(classId, studentId, "Box.lyl")).toHaveLength(1);
    await recordIteration(classId, studentId, "Box.lyl", bytes, null, { now: 1_000_000 + ITERATION_MERGE_MS + 20_000 });
    const iterations = await listIterations(classId, studentId, "Box.lyl");
    expect(iterations).toHaveLength(2);
    expect(iterations[0].savedAt).toBeGreaterThan(iterations[1].savedAt);
  });

  it("gives every student their own copy of a starter and remembers where the work began", async () => {
    const teacher = await teacherCookie();
    const { id: classId, code } = (await call("createClass", { name: "Class" }, teacher)).body.class;
    const form = new FormData();
    form.append("classId", classId);
    form.append("title", "Keyring blank");
    form.append("file", new Blob([(await lyl("Blank")).slice().buffer]), "blank.lyl");
    const uploaded = await layerLabPost(new Request("http://localhost/api/layerlab", { method: "POST", headers: { Origin: "http://localhost", Cookie: teacher }, body: form }));
    expect(uploaded.status).toBe(200);
    const starterId = (await uploaded.json()).class.starters[0].id;
    await call("saveTutorial", { classId, tutorial: { title: "Make a keyring", body: "Step 1\n\nStep 2", starterId } }, teacher);

    const ada = await joinAs(code, "Ada");
    const own = await call("myClass", {}, ada);
    expect(own.body.class.tutorials[0]).toMatchObject({ title: "Make a keyring", starterId });
    expect(own.body.class.students).toEqual([]);

    const first = await call("startFromStarter", { starterId }, ada);
    const second = await call("startFromStarter", { starterId }, ada);
    expect(first.body.fileName).toBe("Keyring blank.lyl");
    expect(second.body.fileName).toBe("Keyring blank 2.lyl");
    const designs = (await call("myClass", {}, ada)).body.designs;
    expect(designs.map((design: { starterTitle?: string }) => design.starterTitle)).toEqual(["Keyring blank", "Keyring blank"]);
  });

  it("carries the history along when a student renames a design", async () => {
    const teacher = await teacherCookie();
    const { code } = (await call("createClass", { name: "Class" }, teacher)).body.class;
    const ada = await joinAs(code, "Ada");
    const saved = await saveAs(ada, "Untitled.lyl", await lyl("Untitled"));
    const revision = (await saved.json()).project.revision;
    await call("addComment", { key: "Untitled.lyl", text: "Hello" }, ada);
    const renamed = await sharedPost(new Request("http://localhost/api/shared-projects?fileName=Untitled.lyl&renameFileTo=Rocket", {
      method: "POST",
      headers: { Origin: "http://localhost", Cookie: ada, "If-Match": `"${revision}"` },
    }));
    expect(renamed.status).toBe(200);
    const [design] = (await call("myClass", {}, ada)).body.designs;
    expect(design).toMatchObject({ key: "Rocket.lyl", iterations: 1, comments: 1 });
  });

  it("starts a student's new designs on the server", async () => {
    const teacher = await teacherCookie();
    const { code } = (await call("createClass", { name: "Class" }, teacher)).body.class;
    const ada = await joinAs(code, "Ada");
    const defaults = await serverDefaultsPost(new Request("http://localhost/api/server-defaults", { method: "POST", headers: { Cookie: ada } }));
    expect((await defaults.json()).newDesignsOnServer).toBe("always");
    expect(layerLabUserFolder(new Request("http://localhost/", { headers: { Cookie: teacher } }))).toBeNull();
  });

  it("closes the server folder to visitors who have not signed in", async () => {
    const teacher = await teacherCookie();
    const listing = (cookie?: string) => sharedGet(new Request("http://localhost/api/shared-projects", { headers: cookie ? { Cookie: cookie } : {} }));
    expect((await (await listing()).json()).enabled).toBe(false);
    const anonymousSave = await sharedPost(new Request("http://localhost/api/shared-projects?fileName=x.lyl", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: (await lyl("x")).slice().buffer,
    }));
    expect(anonymousSave.status).toBe(404);
    expect((await (await listing(teacher)).json()).enabled).toBe(true);
    delete process.env.LAYERLAB_TEACHER_PASSWORD;
    expect((await (await listing()).json()).enabled).toBe(true);
  });

  describe("with Google sign-in", () => {
    const CLIENT_ID = "123-abc.apps.googleusercontent.com";

    beforeEach(() => {
      process.env.LAYERLAB_GOOGLE_CLIENT_ID = CLIENT_ID;
      process.env.LAYERLAB_GOOGLE_CLIENT_SECRET = "shh";
      process.env.LAYERLAB_GOOGLE_DOMAINS = "school.example";
      process.env.LAYERLAB_TEACHER_EMAILS = "Teacher@School.example";
    });

    function idToken(claims: Record<string, unknown>) {
      const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${part({ alg: "RS256" })}.${part({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        email_verified: true,
        hd: "school.example",
        ...claims,
      })}.signature`;
    }

    function googleAnswers(claims: Record<string, unknown>) {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    /** The whole round trip: out to Google with `next`, back with a code. Returns where it lands and the cookies set. */
    async function signInWithGoogle(next: string, claims: Record<string, unknown>, cookie = "") {
      const out = await googleGet(new Request(`https://lab.example/api/layerlab/google?next=${encodeURIComponent(next)}`));
      expect(out.status).toBe(303);
      const google = new URL(out.headers.get("location") ?? "");
      expect(google.origin).toBe("https://accounts.google.com");
      expect(google.searchParams.get("redirect_uri")).toBe("https://lab.example/api/layerlab/google");
      expect(google.searchParams.get("hd")).toBe("school.example");
      expect(google.searchParams.get("scope")).toBe("openid email profile");
      const state = google.searchParams.get("state");
      googleAnswers(claims);
      const back = await googleGet(new Request(`https://lab.example/api/layerlab/google?code=4%2Fabc&state=${state}`, {
        headers: { Cookie: [cookieOf(out), cookie].filter(Boolean).join("; ") },
      }));
      expect(back.status).toBe(303);
      const cookies = back.headers.getSetCookie().map((entry) => entry.split(";")[0]).filter((entry) => !entry.endsWith("="));
      return { location: new URL(back.headers.get("location") ?? ""), cookie: cookies.join("; ") };
    }

    it("joins a student from a Classroom link with the class code, then signs them straight in", async () => {
      const teacher = await teacherCookie();
      const { id: classId, code } = (await call("createClass", { name: "Period 3" }, teacher)).body.class;

      const first = await signInWithGoogle(`/layerlab?code=${code}`, { sub: "1001", email: "sam.k@school.example", given_name: "Sam", family_name: "Kim" });
      expect(first.location.pathname + first.location.search).toBe(`/layerlab?code=${code}`);
      const status = await call("status", {}, first.cookie);
      expect(status.body).toMatchObject({ role: "student", student: { name: "Sam", className: "Period 3" }, google: { enabled: true } });

      // Another Sam joins as "Sam L.", not as the first one.
      const other = await signInWithGoogle(`/layerlab?code=${code}`, { sub: "1002", email: "sam.l@school.example", given_name: "Sam", family_name: "Lee" });
      expect((await call("status", {}, other.cookie)).body.student.name).toBe("Sam L.");

      // Next time, no code needed.
      const again = await signInWithGoogle("/layerlab", { sub: "1001", email: "sam.k@school.example", given_name: "Sam" });
      expect((await call("status", {}, again.cookie)).body.student.studentId).toBe(status.body.student.studentId);

      const listed = (await call("getClass", { classId }, teacher)).body.class.students;
      expect(listed.map((student: { name: string; google?: boolean }) => [student.name, student.google])).toEqual([["Sam", true], ["Sam L.", true]]);
      // Nothing about the Google account but a hash is kept.
      const stored = await fs.readFile(path.join(root, ".layerlab", "classes", `${classId}.json`), "utf8");
      expect(stored).not.toContain("school.example");
      expect(stored).not.toContain("1001");
    });

    it("asks a new Google student for the class code, and lets a PIN student link their account once", async () => {
      const teacher = await teacherCookie();
      const { code } = (await call("createClass", { name: "Period 5" }, teacher)).body.class;
      const pinAda = await joinAs(code, "Ada", "2468");
      const adaId = (await call("status", {}, pinAda)).body.student.studentId;

      const back = await signInWithGoogle("/layerlab", { sub: "2001", email: "ada@school.example", given_name: "Ada" });
      expect(back.location.searchParams.get("google")).toBe("continue");
      const pending = await call("status", {}, back.cookie);
      expect(pending.body).toMatchObject({ role: null, google: { enabled: true, pending: { name: "Ada", classes: [] } } });

      expect((await call("googleContinue", { code }, back.cookie)).body).toMatchObject({ needs: "pin", name: "Ada", className: "Period 5" });
      expect((await call("googleContinue", { code, pin: "0000" }, back.cookie)).response.status).toBe(401);
      const linked = await call("googleContinue", { code, pin: "2468" }, back.cookie);
      expect(linked.body).toEqual({ ok: true });
      const session = linked.response.headers.getSetCookie().map((entry) => entry.split(";")[0]).find((entry) => entry.startsWith("layerlab_session="));
      expect((await call("status", {}, session)).body.student.studentId).toBe(adaId);

      // From now on Google alone signs Ada in, into the same work.
      const again = await signInWithGoogle("/layerlab", { sub: "2001", email: "ada@school.example", given_name: "Ada" });
      expect((await call("status", {}, again.cookie)).body.student.studentId).toBe(adaId);
    });

    it("signs the teacher in by email and keeps other schools' accounts out", async () => {
      const teacher = await signInWithGoogle("/layerlab", { sub: "9", email: "teacher@school.example", given_name: "K" });
      expect((await call("status", {}, teacher.cookie)).body.role).toBe("teacher");

      const outsider = await signInWithGoogle("/layerlab", { sub: "10", email: "kid@gmail.com", given_name: "Kid", hd: undefined });
      expect(outsider.location.searchParams.get("google")).toBe("domain");
      expect(outsider.cookie).toBe("");
    });

    it("refuses a reply from Google that this browser did not ask for", async () => {
      const fetchMock = googleAnswers({ sub: "1", email: "a@school.example" });
      const back = await googleGet(new Request("https://lab.example/api/layerlab/google?code=x&state=forged"));
      expect(new URL(back.headers.get("location") ?? "").searchParams.get("google")).toBe("expired");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("only goes back to a LayerLab page after signing in", async () => {
      const out = await googleGet(new Request("https://lab.example/api/layerlab/google?next=https%3A%2F%2Fevil.example%2F"));
      const state = new URL(out.headers.get("location") ?? "").searchParams.get("state");
      googleAnswers({ sub: "9", email: "teacher@school.example" });
      const back = await googleGet(new Request(`https://lab.example/api/layerlab/google?code=x&state=${state}`, { headers: { Cookie: cookieOf(out) } }));
      expect(back.headers.get("location")).toBe("https://lab.example/layerlab");
    });
  });

  it("is switched off without a teacher password", async () => {
    delete process.env.LAYERLAB_TEACHER_PASSWORD;
    expect((await call("status")).response.status).toBe(404);
  });
});

describe("LayerLab links into the editor", () => {
  it("opens a student's design from their folder or a LayerLab file as a copy, nothing else", () => {
    expect(readLayerLabOpenRequest("?layerlab=new")).toEqual({ kind: "new" });
    expect(readLayerLabOpenRequest("?layerlab=open&path=&file=Box.lyl")).toEqual({ kind: "open", path: "", fileName: "Box.lyl" });
    expect(readLayerLabOpenRequest("?layerlab=open&file=../x.lyl")).toBeNull();
    expect(readLayerLabOpenRequest("?layerlab=copy&src=%2Fapi%2Flayerlab%3Fget%3Ddesign")).toEqual({ kind: "copy", src: "/api/layerlab?get=design" });
    expect(readLayerLabOpenRequest("?layerlab=copy&src=https%3A%2F%2Fevil.example%2Fx.lyl")).toBeNull();
    expect(withoutLayerLabOpenRequest("http://localhost/?layerlab=open&file=a.lyl&editor=1")).toBe("/?editor=1");
  });
});

describe("LayerLab and Google Classroom", () => {
  it("builds Classroom share links and reads LayerLab links back", () => {
    const share = new URL(classroomShareUrl({ url: designPageUrl("https://lab.example", "aaaaaaaa", "bbbbbbbb", "Box/Rocket.lyl"), title: "Rocket (Sam)" }));
    expect(share.origin + share.pathname).toBe("https://classroom.google.com/share");
    expect(share.searchParams.get("title")).toBe("Rocket (Sam)");
    const link = new URL(share.searchParams.get("url") ?? "");
    expect(readLayerLabPageLink(link.search)).toEqual({ design: { classId: "aaaaaaaa", studentId: "bbbbbbbb", key: "Box/Rocket.lyl" } });
    expect(readLayerLabPageLink(new URL(classPageUrl("https://lab.example", "ABC234", "cccccccc")).search)).toEqual({ code: "ABC234", tutorialId: "cccccccc" });
    expect(new URL(classroomShareUrl({ url: "https://x", itemType: "assignment" })).searchParams.get("itemtype")).toBe("assignment");
  });
});
