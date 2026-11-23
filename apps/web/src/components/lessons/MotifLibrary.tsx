"use client";

import { useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";
import {
  buildMotifLayer,
  cleanMotifParams,
  MOTIF_BUILDERS,
  motifDefaults,
  type MotifBuilder,
  type MotifParamKey,
  type MotifParams,
} from "@/lib/lessons/mandalaMotifs";
import { parseMeasurementInput } from "@/lib/measurementUnits";
import type { SketchProfile } from "@/types/layerling";

/**
 * The mandala shape builders and the student's own motifs, inside the lesson panel. A builder
 * makes one whole ring as a sketch body: the editor puts it on top of what is selected, centred.
 * "My motifs" is the Mandala motifs folder of My shapes, so what a student saves there stays in
 * their library (on the server when signed in to LayerLab) and grows as they get better.
 */

export type MotifEntry = { id: string; name: string; thumbnail: string };

/** What the editor gives the panel to work with; every action reports its own errors in the editor's status line. */
export type LessonLibraryTools = {
  /** How many bodies are selected: the new ring goes on top of them. */
  selectionCount: number;
  addLayer: (builderId: string, params: MotifParams) => Promise<boolean>;
  myMotifs: MotifEntry[];
  insertMotif: (id: string) => Promise<boolean>;
  saveMotif: (name: string) => Promise<boolean>;
};

const IN = 25.4;

function fieldLabel(builder: MotifBuilder, key: MotifParamKey) {
  switch (key) {
    case "count":
      return builder.id === "scallop-disc" ? "Bumps on the edge" : builder.id === "star" ? "Points" : "Copies around";
    case "radius":
      return builder.single ? (builder.id === "star" ? "Inner radius" : "Radius") : "Starts from the middle";
    case "length":
      return builder.id === "scallop-disc" ? "Wave depth" : builder.id === "star" ? "Point length" : builder.id === "dots" ? "Dot size" : "Length";
    case "width":
      return "Width";
    case "line":
      return builder.strokeOnly ? "Line width" : "Line width (0 = filled)";
    case "height":
      return "Thickness";
    case "turn":
      return "Turn (degrees)";
  }
}

/** The ring as an SVG path, to see it before it is built. */
function previewPath(profile: SketchProfile) {
  const byId = new Map(profile.points.map((point) => [point.id, point]));
  let path = "";
  let current: string | null = null;
  for (const segment of profile.segments) {
    const from = byId.get(segment.startId);
    const to = byId.get(segment.endId);
    if (!from || !to) continue;
    if (current !== from.id) path += `M${from.x.toFixed(2)} ${from.z.toFixed(2)}`;
    if (segment.kind === "bezier" && from.handleOut && to.handleIn) {
      path += `C${from.handleOut.x.toFixed(2)} ${from.handleOut.z.toFixed(2)} ${to.handleIn.x.toFixed(2)} ${to.handleIn.z.toFixed(2)} ${to.x.toFixed(2)} ${to.z.toFixed(2)}`;
    } else {
      path += `L${to.x.toFixed(2)} ${to.z.toFixed(2)}`;
    }
    current = to.id;
  }
  return path;
}

function MotifPreview({ builderId, params }: { builderId: string; params: MotifParams }) {
  const layer = useMemo(() => buildMotifLayer(builderId, params), [builderId, params]);
  const half = Math.max(1, layer.diameter / 2) * 1.06;
  const line = layer.profile.stroke?.width ?? 0;
  return (
    <svg className="motif-preview" viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`} role="img" aria-label={`Preview of ${layer.name}`}>
      <path
        d={previewPath(layer.profile)}
        fill={line ? "none" : "currentColor"}
        fillRule="nonzero"
        stroke="currentColor"
        strokeWidth={line || half / 200}
        strokeLinecap={layer.profile.stroke?.cap === "round" ? "round" : "butt"}
        strokeLinejoin={layer.profile.stroke?.join === "round" ? "round" : "miter"}
      />
    </svg>
  );
}

type Props = { tools: LessonLibraryTools | undefined; metric: boolean };

export function MotifLibrary({ tools, metric }: Props) {
  const [tab, setTab] = useState<"builders" | "mine">("builders");
  const [builderId, setBuilderId] = useState(MOTIF_BUILDERS[0].id);
  const [settings, setSettings] = useState<Record<string, MotifParams>>({});
  const [busy, setBusy] = useState(false);
  const [motifName, setMotifName] = useState("");

  const builder = MOTIF_BUILDERS.find((entry) => entry.id === builderId) ?? MOTIF_BUILDERS[0];
  const params = settings[builder.id] ?? motifDefaults(builder);
  const unit = metric ? "mm" : "in";
  // Sizes are kept in millimetres and shown in the student's units.
  const shown = (key: MotifParamKey) => {
    const value = params[key];
    if (key === "count" || key === "turn") return String(Math.round(value * 100) / 100);
    return metric ? String(Math.round(value * 10) / 10) : String(Math.round((value / IN) * 1000) / 1000);
  };
  const setField = (key: MotifParamKey, text: string) => {
    // A text field, as every measure in the editor: comma or point, fractions (1/16) and sums.
    const typed = parseMeasurementInput(text);
    if (!Number.isFinite(typed)) return;
    const value = key === "count" || key === "turn" || metric ? typed : typed * IN;
    setSettings((all) => ({ ...all, [builder.id]: cleanMotifParams(builder, { ...params, [key]: value }) }));
  };

  const run = async (work: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  };

  const selection = tools?.selectionCount ?? 0;
  const across = buildMotifLayer(builder.id, params).diameter;

  return (
    <div className="motif-library">
      <div className="lesson-units motif-tabs" role="tablist" aria-label="Library">
        <button type="button" role="tab" aria-selected={tab === "builders"} className={tab === "builders" ? "active" : ""} onClick={() => setTab("builders")}>Shape builders</button>
        <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>My motifs</button>
      </div>

      {tab === "builders" ? (
        <>
          <div className="motif-grid">
            {MOTIF_BUILDERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === builder.id ? "motif-tile active" : "motif-tile"}
                aria-pressed={entry.id === builder.id}
                onClick={() => setBuilderId(entry.id)}
                title={entry.blurb}
              >
                <span style={{ color: entry.color === "#ffffff" ? "#9aa5b1" : entry.color }}>
                  <MotifPreview builderId={entry.id} params={settings[entry.id] ?? motifDefaults(entry)} />
                </span>
                <small>{entry.name}</small>
              </button>
            ))}
          </div>

          <h2>{builder.name}</h2>
          <p className="lesson-muted">{builder.blurb}</p>
          <div className="motif-fields">
            {builder.fields.map((key) => (
              <label key={`${builder.id}-${key}-${metric}-${shown(key)}`}>
                <span>{fieldLabel(builder, key)}{key !== "count" && key !== "turn" ? ` (${unit})` : ""}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={shown(key)}
                  onBlur={(event) => setField(key, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setField(key, event.currentTarget.value);
                  }}
                />
              </label>
            ))}
          </div>
          {builder.fields.includes("turn") && !builder.single ? (
            <button type="button" className="lesson-link-button" onClick={() => setField("turn", String(180 / params.count))}>
              Turn half a step, between the motifs below
            </button>
          ) : null}
          <p className="lesson-muted">
            About {metric ? `${Math.round(across)} mm` : `${(across / IN).toFixed(2)} in`} across. {selection ? `Goes on top of the ${selection === 1 ? "selected body" : `${selection} selected bodies`}, centred.` : "Nothing is selected: goes on the middle of the plate."}
          </p>
          <div className="motif-actions">
            <button type="button" className="lesson-next" disabled={busy || !tools} onClick={() => void run(() => tools!.addLayer(builder.id, params))}>
              <Plus size={15} aria-hidden="true" /> {busy ? "Building..." : "Add to my design"}
            </button>
            <button type="button" className="lesson-link-button" onClick={() => setSettings((all) => {
              const { [builder.id]: _dropped, ...rest } = all;
              return rest;
            })}>Reset</button>
          </div>
        </>
      ) : (
        <>
          <p>Your motifs are the rings and shapes you saved. They stay in your library for every design. Keep adding to it as you get better.</p>
          {tools?.myMotifs.length ? (
            <div className="motif-grid">
              {tools.myMotifs.map((motif) => (
                <button key={motif.id} type="button" className="motif-tile" disabled={busy} onClick={() => void run(() => tools.insertMotif(motif.id))} title={`Add ${motif.name} to my design`}>
                  {motif.thumbnail ? <img src={motif.thumbnail} alt="" /> : <span className="motif-tile-empty" aria-hidden="true" />}
                  <small>{motif.name}</small>
                </button>
              ))}
            </div>
          ) : <p className="lesson-muted">No motifs yet. Select a ring you made and save it below.</p>}
          <h2>Save a motif</h2>
          <p className="lesson-muted">{selection ? `Saves the ${selection === 1 ? "selected body" : `${selection} selected bodies`} to your library.` : "Select the ring or shape you want to keep first."}</p>
          <div className="motif-fields">
            <label>
              <span>Name</span>
              <input type="text" value={motifName} maxLength={80} placeholder="My lotus ring" onChange={(event) => setMotifName(event.currentTarget.value)} />
            </label>
          </div>
          <div className="motif-actions">
            <button
              type="button"
              className="lesson-next"
              disabled={busy || !tools || !selection || !motifName.trim()}
              onClick={() => void run(async () => {
                const saved = await tools!.saveMotif(motifName.trim());
                if (saved) setMotifName("");
                return saved;
              })}
            >
              <Save size={15} aria-hidden="true" /> Save the selection
            </button>
          </div>
        </>
      )}
    </div>
  );
}
