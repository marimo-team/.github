export type JsonObject = Record<string, unknown>;

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(raw: string): Parsed<JsonObject> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["output is not valid JSON"] };
  }
  return isRecord(value)
    ? { ok: true, value }
    : { ok: false, errors: ["output must be a JSON object"] };
}

/** Collects every validation error instead of stopping at the first. */
export class Reader {
  readonly errors: string[] = [];

  /** Truncates to `max` characters: an overlong field isn't worth discarding the output. */
  string(object: JsonObject, key: string, max: number, at: string): string {
    const value = object[key];
    if (typeof value !== "string" || value.trim() === "") {
      this.errors.push(`${at}.${key} must be a non-empty string`);
      return "";
    }
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  integer(object: JsonObject, key: string, min: number, at: string): number {
    const value = object[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
      this.errors.push(`${at}.${key} must be an integer of at least ${min}`);
      return min;
    }
    return value;
  }

  boolean(object: JsonObject, key: string, at: string): boolean {
    const value = object[key];
    if (typeof value !== "boolean") {
      this.errors.push(`${at}.${key} must be a boolean`);
      return false;
    }
    return value;
  }

  oneOf<T extends string>(
    object: JsonObject,
    key: string,
    allowed: readonly [T, ...T[]],
    at: string,
  ): T {
    const value = object[key];
    if (!allowed.includes(value as T)) {
      this.errors.push(`${at}.${key} must be one of ${allowed.join(", ")}`);
      return allowed[0];
    }
    return value as T;
  }

  array(object: JsonObject, key: string, max: number, at: string): unknown[] {
    const value = object[key];
    if (!Array.isArray(value)) {
      this.errors.push(`${at}.${key} must be an array`);
      return [];
    }
    if (value.length > max) {
      this.errors.push(`${at}.${key} has more than ${max} items`);
    }
    return value.slice(0, max);
  }

  object(value: unknown, at: string): JsonObject | undefined {
    if (isRecord(value)) return value;
    this.errors.push(`${at} must be an object`);
    return undefined;
  }

  finish<T>(value: T): Parsed<T> {
    return this.errors.length ? { ok: false, errors: this.errors } : { ok: true, value };
  }
}
