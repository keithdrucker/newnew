// Express delivers query params as strings. The orval-generated Zod schemas
// expect numbers (and sometimes literal numbers like 30|180|365) or Date
// instances (for `format: date-time` params). Coerce those known fields
// before validation.
const NUMERIC_KEYS = new Set(["rangeDays", "departmentId"]);
const DATE_KEYS = new Set([
  "createdAfter",
  "createdBefore",
  "updatedAfter",
  "updatedBefore",
]);

export function coerceQuery(
  q: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (NUMERIC_KEYS.has(k) && typeof v === "string" && v !== "") {
      const n = Number(v);
      out[k] = Number.isNaN(n) ? v : n;
    } else if (DATE_KEYS.has(k) && typeof v === "string" && v !== "") {
      const d = new Date(v);
      out[k] = Number.isNaN(d.getTime()) ? v : d;
    } else {
      out[k] = v;
    }
  }
  return out;
}
