/**
 * Minimal in-memory stand-in for the supabase-js PostgREST query builder (test-only).
 *
 * Supports exactly the builder surface the account/Project stores use and mirrors the
 * Journey migration's integrity rules that matter for ownership:
 *  - unique keys (users.normalized_email, users.auth_user_id, artifact project/kind/version)
 *  - child (project_id, user_id) must match the owning Project
 *  - projects.selected_generation_id must reference a generation of the same project + user
 */
import { randomUUID } from "node:crypto";

const UNIQUE_KEYS = {
  users: [["normalized_email"], ["auth_user_id"]],
  project_artifacts: [["project_id", "kind", "version"]]
};

const DEFAULTS = {
  users: () => ({ auth_user_id: null, stripe_customer_id: null }),
  projects: () => ({ title: "Untitled Song", status: "active", current_stage: "idea", selected_generation_id: null }),
  project_generations: () => ({ source: "suno", external_id: null, external_url: null, label: null, selected: false, metadata: {} })
};

export function createFakeSupabase(seed = {}) {
  const tables = new Map();
  const failures = new Map();
  let clock = Date.parse("2026-10-05T12:00:00.000Z");
  const nextTimestamp = () => new Date((clock += 1000)).toISOString();

  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, rows.map((row) => ({ ...row })));
  }
  const rowsOf = (table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };

  function constraintError(rowsAfter, table) {
    for (const key of UNIQUE_KEYS[table] ?? []) {
      const seen = new Set();
      for (const row of rowsAfter) {
        if (key.some((column) => row[column] === null || row[column] === undefined)) continue;
        const signature = JSON.stringify(key.map((column) => row[column]));
        if (seen.has(signature)) {
          return { code: "23505", message: `duplicate key value violates unique constraint on ${table}(${key.join(",")})` };
        }
        seen.add(signature);
      }
    }
    if (table === "project_artifacts" || table === "project_generations") {
      for (const row of rowsAfter) {
        const owner = rowsOf("projects").find((project) => project.id === row.project_id && project.user_id === row.user_id);
        if (!owner) return { code: "23503", message: `${table}_project_owner_fk violation` };
      }
    }
    if (table === "projects") {
      for (const row of rowsAfter) {
        if (!row.selected_generation_id) continue;
        const generation = rowsOf("project_generations").find(
          (item) => item.id === row.selected_generation_id && item.project_id === row.id && item.user_id === row.user_id
        );
        if (!generation) return { code: "23514", message: "selected_generation_id must reference a generation of the same project and user" };
      }
    }
    return null;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.filters = [];
      this.orders = [];
      this.limitCount = null;
      this.mode = "many";
      this.returning = false;
      this.payload = null;
    }
    select() {
      if (this.op === "select") return this;
      this.returning = true;
      return this;
    }
    insert(rows) {
      this.op = "insert";
      this.payload = Array.isArray(rows) ? rows : [rows];
      return this;
    }
    update(patch) {
      this.op = "update";
      this.payload = patch;
      return this;
    }
    eq(column, value) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    neq(column, value) {
      this.filters.push((row) => row[column] !== value);
      return this;
    }
    in(column, values) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    is(column, value) {
      this.filters.push((row) => (value === null ? row[column] === null || row[column] === undefined : row[column] === value));
      return this;
    }
    order(column, options = {}) {
      this.orders.push({ column, ascending: options.ascending !== false });
      return this;
    }
    limit(count) {
      this.limitCount = count;
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }
    then(resolve, reject) {
      return Promise.resolve().then(() => this.execute()).then(resolve, reject);
    }

    shape(rows) {
      const copies = rows.map((row) => structuredClone(row));
      if (this.mode === "many") return { data: copies, error: null };
      if (copies.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows returned" } };
      if (copies.length === 0) {
        return this.mode === "single"
          ? { data: null, error: { code: "PGRST116", message: "no rows returned" } }
          : { data: null, error: null };
      }
      return { data: copies[0], error: null };
    }

    execute() {
      const forced = failures.get(`${this.table}:${this.op}`);
      if (forced) return { data: null, error: { message: forced } };
      const rows = rowsOf(this.table);
      const matches = () => rows.filter((row) => this.filters.every((filter) => filter(row)));

      if (this.op === "select") {
        let selected = matches();
        for (const { column, ascending } of [...this.orders].reverse()) {
          selected = [...selected].sort((a, b) => {
            if (a[column] === b[column]) return 0;
            return (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1);
          });
        }
        if (this.limitCount !== null) selected = selected.slice(0, this.limitCount);
        return this.shape(selected);
      }

      if (this.op === "insert") {
        const now = nextTimestamp();
        const inserted = this.payload.map((row) => ({
          id: randomUUID(),
          created_at: now,
          updated_at: now,
          ...(DEFAULTS[this.table]?.() ?? {}),
          ...structuredClone(row)
        }));
        const error = constraintError([...rows, ...inserted], this.table);
        if (error) return { data: null, error };
        rows.push(...inserted);
        return this.returning ? this.shape(inserted) : { data: null, error: null };
      }

      if (this.op === "update") {
        const targets = matches();
        const updated = targets.map((row) => ({ ...row, ...structuredClone(this.payload) }));
        const after = rows.map((row) => updated.find((item) => item.id === row.id) ?? row);
        const error = constraintError(after, this.table);
        if (error) return { data: null, error };
        for (const row of updated) {
          const index = rows.findIndex((item) => item.id === row.id);
          rows[index] = row;
        }
        return this.returning ? this.shape(updated) : { data: null, error: null };
      }

      throw new Error(`fake supabase: unsupported op ${this.op}`);
    }
  }

  return {
    from: (table) => new Query(table),
    rows: (table) => rowsOf(table),
    failNext: (table, op, message) => failures.set(`${table}:${op}`, message),
    clearFailures: () => failures.clear()
  };
}
