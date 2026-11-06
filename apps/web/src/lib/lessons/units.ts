/**
 * Lessons are written in inches (fractions, as the editor shows them). A student working in
 * millimetres sees every size in the text turned into millimetres instead: "2 5/8 in" reads
 * "67 mm", "3/4 x 3/4 x 1 3/8 in" reads "19 x 19 x 35 mm", "6 to 8 in" reads "152 to 203 mm".
 */

const NUMBER = String.raw`(?:\d+ \d+/\d+|\d+/\d+|\d+(?:\.\d+)?)`;
const LIST = new RegExp(String.raw`(${NUMBER})((?:\s*(?:x|to|and|-)\s*${NUMBER})*)\s?in\b`, "g");

function inchValue(text: string) {
  const parts = text.trim().split(" ");
  return parts.reduce((sum, part) => {
    if (part.includes("/")) {
      const [top, bottom] = part.split("/").map(Number);
      return sum + top / bottom;
    }
    return sum + Number(part);
  }, 0);
}

export function millimetres(inches: number) {
  const mm = inches * 25.4;
  if (mm < 3) return String(Math.round(mm * 10) / 10);
  if (mm < 10) return String(Math.round(mm * 2) / 2);
  return String(Math.round(mm));
}

export function toMetric(text: string) {
  return text.replace(LIST, (_match, first: string, rest: string) => {
    const pieces = rest.split(new RegExp(String.raw`(\s*(?:x|to|and|-)\s*)`));
    const converted = pieces.map((piece, index) => (index % 2 === 1 ? piece : piece ? millimetres(inchValue(piece)) : piece)).join("");
    return `${millimetres(inchValue(first))}${converted} mm`;
  });
}

/** The lesson's text in the workspace's units. */
export const lessonText = (text: string, metric: boolean) => (metric ? toMetric(text) : text);
