import { checkAttempts, clearAttempts, failedAttempt } from "@/lib/layerlab/attempts";
import type { GooglePending } from "@/lib/layerlab/google";
import { pinMatches, type LayerLabSession } from "@/lib/layerlab/session";
import { addGoogleStudent, classByCode, classesOfGoogleStudent, LayerLabError, linkGoogle, sameName, sharedStoreRoot } from "@/lib/layerlab/store";
import type { LayerLabGoogleAnswer } from "@/lib/layerlab/types";

/**
 * Puts a student who signed in with Google into a class.
 *
 * - With a class code (typed, or from the link the teacher posted in Google Classroom) they join
 *   that class, under their first name. If a student of that name joined before with a PIN, the
 *   PIN links the two once; someone else of the same name joins as "Sam K.".
 * - Without one, the classes they joined before: one signs straight in, several are a choice.
 */
export async function placeGoogleStudent(
  identity: GooglePending,
  choice: { code?: string; classId?: string; pin?: string; asNew?: boolean } = {},
): Promise<{ session: LayerLabSession } | Exclude<LayerLabGoogleAnswer, { ok: true }>> {
  const session = (classId: string, studentId: string) => ({ session: { role: "student" as const, classId, studentId, issuedAt: Date.now() } });

  if (choice.code) {
    if (!sharedStoreRoot()) throw new LayerLabError("The server has no folder for student work yet. Ask your teacher.", 503);
    const stored = await classByCode(choice.code);
    const mine = stored.students.find((student) => student.googleId === identity.googleId);
    if (mine) return session(stored.id, mine.id);
    const namesake = stored.students.find((student) => !student.googleId && student.pinHash && sameName(student.name, identity.givenName));
    if (namesake && !choice.asNew) {
      const pin = choice.pin?.trim() ?? "";
      if (!pin) return { needs: "pin", className: stored.name, name: namesake.name };
      const key = `student:${stored.id}:${namesake.name.toLowerCase()}`;
      checkAttempts(key);
      if (!pinMatches(pin, namesake.pinHash)) {
        failedAttempt(key);
        throw new LayerLabError("That PIN does not match. Ask your teacher to reset it, or join as a different student.", 401);
      }
      clearAttempts(key);
      await linkGoogle(stored.id, namesake.id, identity.googleId);
      return session(stored.id, namesake.id);
    }
    const added = await addGoogleStudent(stored.id, identity.givenName, identity.familyInitial, identity.googleId);
    return session(stored.id, added.id);
  }

  const classes = await classesOfGoogleStudent(identity.googleId);
  if (choice.classId) {
    const picked = classes.find((entry) => entry.classId === choice.classId);
    if (!picked) throw new LayerLabError("You are not in that class", 403);
    return session(picked.classId, picked.studentId);
  }
  if (classes.length === 1) return session(classes[0].classId, classes[0].studentId);
  if (classes.length > 1) return { needs: "pick", classes: classes.map((entry) => ({ id: entry.classId, name: entry.className })) };
  return { needs: "code" };
}
