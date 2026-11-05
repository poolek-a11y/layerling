"use client";

import { GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchLayerLabStatus } from "@/lib/layerlab/client";
import type { LayerLabStatus } from "@/lib/layerlab/types";
import "@/app/layerlab/layerlab.css";

/** The way into the classroom from the start page; shown only on a server where LayerLab is switched on. */
export function LayerLabLink() {
  const [status, setStatus] = useState<LayerLabStatus | null>(null);
  useEffect(() => {
    let live = true;
    void fetchLayerLabStatus().then((next) => live && setStatus(next));
    return () => {
      live = false;
    };
  }, []);
  if (!status?.enabled) return null;
  const label = status.role === "student" && status.student ? status.student.className : "LayerLab";
  return (
    <a className="layerlab-link" href="/layerlab" title="LayerLab classroom">
      <GraduationCap size={16} strokeWidth={2.4} aria-hidden />
      <span>{label}</span>
    </a>
  );
}
