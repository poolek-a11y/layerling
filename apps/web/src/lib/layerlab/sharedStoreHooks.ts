import { sessionFromRequest } from "@/lib/layerlab/session";
import { designKey, moveDesignHistory, recordIteration } from "@/lib/layerlab/store";

/**
 * The few places where the shared-projects route tells LayerLab what happened. Each one does
 * nothing unless a student is signed in, and none of them can make a save fail: the student's
 * design is on disk already, a missing iteration is only logged.
 */

export async function layerLabAfterSave(request: Request, folderPath: string, fileName: string, bytes: Uint8Array, thumbnail: Uint8Array | null) {
  const session = sessionFromRequest(request);
  if (session?.role !== "student") return;
  await recordIteration(session.classId, session.studentId, designKey(folderPath, fileName), bytes, thumbnail)
    .catch((error) => console.warn("layerlab: could not keep an iteration", error));
}

export async function layerLabAfterMove(request: Request, fromFolder: string, fromFile: string, toFolder: string, toFile: string) {
  const session = sessionFromRequest(request);
  if (session?.role !== "student") return;
  await moveDesignHistory(session.classId, session.studentId, designKey(fromFolder, fromFile), designKey(toFolder, toFile))
    .catch((error) => console.warn("layerlab: could not move the history of a design", error));
}
