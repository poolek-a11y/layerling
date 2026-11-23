"use client";

import { useCallback, useMemo } from "react";
import type { LessonLibraryTools } from "@/components/lessons/MotifLibrary";
import type { CustomShapeEntry, CustomShapeFolder, CustomShapeLocation } from "@/components/workplane/MyShapesSection";
import { boundsForShapes } from "@/lib/editorMeshCore";
import { buildMandalaLayer, buildOffsetLayer } from "@/lib/lessons/mandalaBuild";
import { strokeWidthOf, type OffsetSettings } from "@/lib/lessons/mandalaOffset";
import type { MotifParams } from "@/lib/lessons/mandalaMotifs";
import { mandalaPlaceOn } from "@/lib/lessons/mandalaPlace";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * The editor's side of a lesson's shape library: a builder's ring put into the design on top of
 * the selection, and the student's motifs, which are the custom shapes in one folder of My
 * shapes. On the server when there is one (a LayerLab student's own folder), so the library
 * follows the student to every design and every computer.
 */

export const MOTIF_FOLDER = "Mandala motifs";

type Options = {
  shapesRef: { current: WorkplaneShape[] };
  selectedIds: string[];
  commitShapes: (next: WorkplaneShape[], nextSelection?: string | string[] | null, message?: string) => void;
  setNotice: (message: string, busy?: boolean) => void;
  noticeError: (error: unknown) => void;
  customShapeEntries: CustomShapeEntry[];
  customShapeFolders: CustomShapeFolder[];
  serverAvailable: boolean;
  saveSelectionAsMyShape: (name: string, ids?: string[], location?: CustomShapeLocation, folderId?: string | null) => Promise<unknown>;
  insertMyShape: (id: string) => Promise<unknown>;
  createShapeFolder: (name: string, location: CustomShapeLocation, parentId?: string | null) => Promise<string>;
};

export function useLessonLibrary(options: Options): LessonLibraryTools {
  const { shapesRef, selectedIds, commitShapes, setNotice, noticeError, customShapeEntries, customShapeFolders, serverAvailable } = options;
  const { saveSelectionAsMyShape, insertMyShape, createShapeFolder } = options;
  const location: CustomShapeLocation = serverAvailable ? "server" : "browser";
  const folder = customShapeFolders.find((entry) => entry.parentId === null && entry.location === location && entry.name === MOTIF_FOLDER) ?? null;

  const addLayer = useCallback(async (builderId: string, params: MotifParams, level = false) => {
    const selected = shapesRef.current.filter((shape) => selectedIds.includes(shape.id));
    const place = mandalaPlaceOn(selected, selected.length ? boundsForShapes(selected) : null, level);
    setNotice("Building the ring...", true);
    try {
      const layer = await buildMandalaLayer(builderId, params, place);
      commitShapes([...shapesRef.current, layer], [layer.id], `Added ${layer.name}`);
      setNotice(`Added ${layer.name}. Select it and press Edit sketch to change it.`);
      return true;
    } catch (error) {
      noticeError(error);
      return false;
    }
  }, [shapesRef, selectedIds, commitShapes, setNotice, noticeError]);

  const addOffsetLayer = useCallback(async (settings: OffsetSettings) => {
    const selected = shapesRef.current.filter((shape) => selectedIds.includes(shape.id));
    if (!selected.length) {
      setNotice("Select the layer to offset first: click it, or Shift-click every ring of it.");
      return false;
    }
    const box = boundsForShapes(selected);
    // The new layer's number: one more than the layers that stand below its top.
    const levels = new Set(shapesRef.current
      .filter((shape) => (shape.elevation ?? 0) < box.maxY - 0.01)
      .map((shape) => Math.round((shape.elevation ?? 0) * 10)));
    setNotice("Building the offset layer...", true);
    try {
      const layer = await buildOffsetLayer(selected, settings, Math.round(box.maxY * 1000) / 1000, levels.size + 1);
      commitShapes([...shapesRef.current, layer], [layer.id], `Added ${layer.name}`);
      setNotice(`Added ${layer.name}. Select it and add the next one on top.`);
      return true;
    } catch (error) {
      noticeError(error);
      return false;
    }
  }, [shapesRef, selectedIds, commitShapes, setNotice, noticeError]);

  const insertMotif = useCallback(async (id: string) => {
    try {
      await insertMyShape(id);
      return true;
    } catch (error) {
      noticeError(error);
      return false;
    }
  }, [insertMyShape, noticeError]);

  const saveMotif = useCallback(async (name: string) => {
    try {
      const folderId = folder?.id ?? await createShapeFolder(MOTIF_FOLDER, location, null);
      await saveSelectionAsMyShape(name, undefined, location, folderId);
      return true;
    } catch (error) {
      noticeError(error);
      return false;
    }
  }, [folder, location, createShapeFolder, saveSelectionAsMyShape, noticeError]);

  const myMotifs = useMemo(
    () => (folder ? customShapeEntries.filter((entry) => entry.folderId === folder.id).map(({ id, name, thumbnail }) => ({ id, name, thumbnail })) : []),
    [folder, customShapeEntries],
  );

  const selectedLine = useMemo(() => strokeWidthOf(shapesRef.current.filter((shape) => selectedIds.includes(shape.id))), [shapesRef, selectedIds]);

  return useMemo(
    () => ({ selectionCount: selectedIds.length, selectedLine, addLayer, addOffsetLayer, myMotifs, insertMotif, saveMotif }),
    [selectedIds.length, selectedLine, addLayer, addOffsetLayer, myMotifs, insertMotif, saveMotif],
  );
}
