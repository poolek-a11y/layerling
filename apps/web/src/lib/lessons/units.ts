/**
 * Lessons are written in inches as fractions. A student working in decimal inches (the default)
 * reads "2 5/8 in" as "2.63 in". A student working in
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

/** Inches as a decimal the way the class reads them: 2.25, 2.63, 0.031 (whole inches stay 2, 6), as the editor shows them. */
export function decimalInches(inches: number) {
  if (Number.isInteger(inches)) return String(inches);
  // Two places, as the editor shows them; tiny sizes (a 1/32 in wisp) need a third.
  return inches.toFixed(Math.abs(inches) < 0.1 ? 3 : 2);
}

/** "2 5/8 in" reads "2.63 in", "3/4 x 3/4 x 1 3/8 in" reads "0.75 x 0.75 x 1.38 in". */
export function toDecimalInches(text: string) {
  return text.replace(LIST, (_match, first: string, rest: string) => {
    const pieces = rest.split(new RegExp(String.raw`(\s*(?:x|to|and|-)\s*)`));
    const converted = pieces.map((piece, index) => (index % 2 === 1 ? piece : piece ? decimalInches(inchValue(piece)) : piece)).join("");
    return `${decimalInches(inchValue(first))}${converted} in`;
  });
}

export function toMetric(text: string) {
  return text.replace(LIST, (_match, first: string, rest: string) => {
    const pieces = rest.split(new RegExp(String.raw`(\s*(?:x|to|and|-)\s*)`));
    const converted = pieces.map((piece, index) => (index % 2 === 1 ? piece : piece ? millimetres(inchValue(piece)) : piece)).join("");
    return `${millimetres(inchValue(first))}${converted} mm`;
  });
}

export type LessonUnits = "decimal" | "fraction" | "metric";

/** The lesson's text (written in fractions of an inch) in the units the student works in. */
export const lessonText = (text: string, units: LessonUnits) => (units === "metric" ? toMetric(text) : units === "decimal" ? toDecimalInches(text) : text);
