import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fixturesAllowed } from "../src/ui/fixtures-flag";

describe("admin UI: development fixtures guard", () => {
  it("needs a development bundle and the explicit flag", () => {
    expect(fixturesAllowed({ NODE_ENV: "development", NEXT_PUBLIC_ADMIN_DEV_FIXTURES: "1" })).toBe(true);
    expect(fixturesAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(fixturesAllowed({ NODE_ENV: "development", NEXT_PUBLIC_ADMIN_DEV_FIXTURES: "true" })).toBe(false);
    expect(fixturesAllowed({ NODE_ENV: "development", NEXT_PUBLIC_ADMIN_DEV_FIXTURES: "0" })).toBe(false);
  });
  it("cannot be enabled in production or test, whatever the flag says", () => {
    for (const NODE_ENV of ["production", "test", "staging", "", undefined])
      expect(fixturesAllowed({ NODE_ENV, NEXT_PUBLIC_ADMIN_DEV_FIXTURES: "1" })).toBe(false);
  });
  it("only runs on a loopback host", () => {
    const on = { NODE_ENV: "development", NEXT_PUBLIC_ADMIN_DEV_FIXTURES: "1" };
    expect(fixturesAllowed(on, "localhost")).toBe(true);
    expect(fixturesAllowed(on, "127.0.0.1")).toBe(true);
    expect(fixturesAllowed(on, "admin.thevelani.com")).toBe(false);
    expect(fixturesAllowed(on, "velani-admin.vercel.app")).toBe(false);
  });
  it("is the only place the fixture module is loaded, behind literal build-time checks", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk("src");
    const importers = files.filter(
      (f) => !f.endsWith("dev-fixtures.ts") && /dev-fixtures/.test(readFileSync(f, "utf8")),
    );
    expect(importers).toEqual([join("src", "ui", "app.tsx")]);
    const app = readFileSync(importers[0], "utf8");
    // A dynamic import only, inside a literal NODE_ENV and flag check that the
    // bundler replaces at build time and removes from production output.
    expect(app).not.toMatch(/from\s+["']\.\/dev-fixtures["']/);
    expect(app).toMatch(
      /process\.env\.NODE_ENV === "development" &&\s*process\.env\.NEXT_PUBLIC_ADMIN_DEV_FIXTURES === "1"[\s\S]{0,400}import\("\.\/dev-fixtures"\)/,
    );
    expect(readFileSync(join("src", "ui", "dev-fixtures.ts"), "utf8")).toMatch(
      /process\.env\.NODE_ENV !== "development"\)\s*throw/,
    );
  });
  it("is absent from the production build output, even when built with the flag set", () => {
    // Evidence build: NEXT_PUBLIC_ADMIN_DEV_FIXTURES=1 npm run build
    // (recorded in docs/handoffs/2026-11-12-claude-admin-ui.md). next.test.ts
    // already requires a build, so the output is present in a full run.
    const root = join(".next", "static");
    if (!existsSync(root)) throw new Error("Run `npm run build` before this test.");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|json)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          if (
            text.includes("velani-admin-dev-fixtures-module") ||
            text.includes("Fictional Qualification")
          )
            hits.push(p);
        }
      }
    };
    walk(root);
    const server = join(".next", "server");
    if (existsSync(server)) walk(server);
    expect(hits).toEqual([]);
  });
});
