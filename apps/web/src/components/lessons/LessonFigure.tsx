import type { FigurePart, StepFigure } from "@/lib/lessons/types";

/**
 * The picture at a step: the doll seen from the front, in inches, with the part to add drawn as
 * an orange dashed outline and holes in see-through grey, the way the editor shows them.
 */

const PX = 34;
const HALF_WIDTH = 2.6;

function partPath(part: FigurePart, toX: (x: number) => number, toY: (y: number) => number) {
  const left = toX(part.x - part.w / 2);
  const right = toX(part.x + part.w / 2);
  const bottom = toY(part.y);
  const top = toY(part.y + part.h);
  const cx = toX(part.x);
  switch (part.shape) {
    case "taper": {
      const topHalf = ((part.topW ?? part.w) / 2) * PX;
      return `M${left} ${bottom}L${right} ${bottom}L${cx + topHalf} ${top}L${cx - topHalf} ${top}Z`;
    }
    case "dome":
      return `M${left} ${bottom}A${(part.w / 2) * PX} ${part.h * PX} 0 0 1 ${right} ${bottom}Z`;
    case "crescent": {
      const r = (part.w / 2) * PX;
      return `M${left} ${top}A${r} ${part.h * PX} 0 0 0 ${right} ${top}A${r * 0.8} ${part.h * PX * 0.6} 0 0 1 ${left} ${top}Z`;
    }
    case "tri":
      return `M${left} ${bottom}L${right} ${bottom}L${cx} ${top}Z`;
    case "line":
      return `M${cx} ${bottom}L${cx} ${top}`;
    case "ring":
    case "rect":
    default:
      return `M${left} ${bottom}L${right} ${bottom}L${right} ${top}L${left} ${top}Z`;
  }
}

export function LessonFigure({ figure }: { figure: StepFigure }) {
  const height = figure.height ?? Math.max(4.5, ...figure.parts.map((part) => part.y + part.h)) + 0.4;
  const width = HALF_WIDTH * 2 * PX;
  const viewHeight = height * PX + 12;
  const toX = (x: number) => width / 2 + x * PX;
  const toY = (y: number) => viewHeight - 10 - y * PX;
  return (
    <figure className="lesson-figure">
      <svg viewBox={`0 0 ${width} ${viewHeight}`} role="img" aria-label={figure.caption ?? "Where the part goes"}>
        <line className="lesson-figure-ground" x1={8} x2={width - 8} y1={toY(0)} y2={toY(0)} />
        {figure.parts.map((part, index) => {
          const state = part.state ?? "done";
          const transform = part.tilt ? `rotate(${part.tilt} ${toX(part.x)} ${toY(part.y + part.h / 2)})` : undefined;
          if (part.shape === "ellipse") {
            return (
              <ellipse
                key={index}
                className={`lesson-figure-part ${state}`}
                cx={toX(part.x)}
                cy={toY(part.y + part.h / 2)}
                rx={(part.w / 2) * PX}
                ry={(part.h / 2) * PX}
                transform={transform}
              />
            );
          }
          return <path key={index} className={`lesson-figure-part ${state} ${part.shape}`} d={partPath(part, toX, toY)} transform={transform} />;
        })}
      </svg>
      {figure.caption ? <figcaption>{figure.caption}</figcaption> : null}
    </figure>
  );
}
