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
  "from",
  "to",
]);
// Repeatable query params (OpenAPI `style: form, explode: true`). Express
// gives us a string when the param appears once (e.g. ?status=new) and
// a string[] when it repeats (?status=new&status=in_progress). The
// generated Zod schema expects an array either way, so always normalize.
const ARRAY_KEYS = new Set(["status"]);

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
    } else if (ARRAY_KEYS.has(k)) {
      if (Array.isArray(v)) out[k] = v;
      else if (typeof v === "string" && v !== "") out[k] = [v];
      else out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}
