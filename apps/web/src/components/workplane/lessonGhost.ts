import * as THREE from "three";
import type { GhostPart } from "@/lib/lessons/types";
import { RENDER_LAYER_HELPERS, disposeObject, setObjectRenderLayer, type ThreeState } from "@/components/workplane/ViewportOverlays";

/**
 * The guided lesson's placement outline in the 3D view (Tinkercad-lesson style): a see-through
 * orange shape with bright edges where the next part goes, grey for a hole. It sits on the
 * helper layer, so it is never picked, exported or snapped to.
 */

const GHOST_NAME = "LessonGhost";
const SOLID = "#ff8a1f";
const HOLE = "#8a8f98";

function ghostGeometry(part: GhostPart): THREE.BufferGeometry {
  switch (part.kind) {
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 40, 1);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 40, 1);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 16);
    case "halfSphere": {
      // A dome from its flat bottom (y = -0.5) to its top (y = 0.5) in a unit box.
      const dome = new THREE.SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 2, 1);
      dome.translate(0, -0.5, 0);
      return dome;
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

/** Draws the outline for `parts`, or clears it for null / an empty list. */
export function syncLessonGhost(state: ThreeState, parts: GhostPart[] | null | undefined) {
  const old = state.scene.getObjectByName(GHOST_NAME);
  if (old) {
    state.scene.remove(old);
    disposeObject(old);
  }
  if (!parts?.length) {
    if (old) state.needsRender = true;
    return;
  }
  const group = new THREE.Group();
  group.name = GHOST_NAME;
  for (const part of parts) {
    const colour = part.hole ? HOLE : SOLID;
    const geometry = ghostGeometry(part);
    const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.18, depthWrite: false }));
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, part.kind === "box" ? 1 : 30),
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.95, depthTest: false }),
    );
    // Round shapes have no hard edges: a ring around the middle and the bottom shows their outline.
    const holder = new THREE.Group();
    holder.add(fill, edges);
    if (part.kind !== "box") {
      const ringGeometry = new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 65 }, (_, index) => {
          const angle = (index / 64) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
        }),
      );
      const levels = part.kind === "sphere" ? [0] : part.kind === "cone" ? [-0.5] : [-0.5, part.kind === "cylinder" ? 0.5 : -0.5];
      for (const level of new Set(levels)) {
        const ring = new THREE.Line(ringGeometry, new THREE.LineBasicMaterial({ color: colour, depthTest: false }));
        ring.position.y = level;
        holder.add(ring);
      }
      if (part.kind === "sphere" || part.kind === "halfSphere") {
        // A front-facing outline so the dome reads as round from the front.
        const half = part.kind === "halfSphere";
        const outline = new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: half ? 33 : 65 }, (_, index) => {
            const angle = (index / 64) * Math.PI * 2;
            return half
              ? new THREE.Vector3(Math.cos(angle) * 0.5, -0.5 + Math.sin(angle), 0)
              : new THREE.Vector3(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0);
          }),
        );
        holder.add(new THREE.Line(outline, new THREE.LineBasicMaterial({ color: colour, depthTest: false })));
      }
    }
    holder.scale.set(Math.max(part.w, 0.1), Math.max(part.h, 0.1), Math.max(part.d, 0.1));
    holder.position.set(part.x, part.y + part.h / 2, part.z);
    holder.traverse((child) => {
      child.renderOrder = 900;
    });
    group.add(holder);
  }
  setObjectRenderLayer(group, RENDER_LAYER_HELPERS);
  state.scene.add(group);
  state.needsRender = true;
}
