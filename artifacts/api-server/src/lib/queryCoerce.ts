// Express delivers query params as strings. The orval-generated Zod schemas
// expect numbers (and sometimes literal numbers like 30|180|365). Coerce
// known numeric fields before validation.
const NUMERIC_KEYS = new Set(["rangeDays", "departmentId"]);

export function coerceQuery(
  q: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (NUMERIC_KEYS.has(k) && typeof v === "string" && v !== "") {
      const n = Number(v);
      out[k] = Number.isNaN(n) ? v : n;
    } else {
      out[k] = v;
    }
  }
  return out;
}
