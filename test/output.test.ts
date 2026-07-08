import { describe, it, expect } from "vitest";
import { projectFields, render } from "../src/output";

describe("projectFields", () => {
  it("keeps dotted paths on array rows", () => {
    const rows = [
      { id: 1, name: "A", meta: { status: "active" }, extra: "drop" },
      { id: 2, name: "B", meta: { status: "paused" }, extra: "drop" },
    ];
    expect(projectFields(rows, "id,meta.status")).toEqual([
      { id: 1, "meta.status": "active" },
      { id: 2, "meta.status": "paused" },
    ]);
  });

  it("projects a single object and returns undefined for missing hops", () => {
    expect(projectFields({ a: { b: 1 } }, "a.b,a.z")).toEqual({ "a.b": 1, "a.z": undefined });
  });

  it("passes data through unchanged when no fields requested", () => {
    const d = [{ a: 1 }];
    expect(projectFields(d, undefined)).toBe(d);
  });
});

describe("render", () => {
  const rows = [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ];

  it("json is compact by default and parseable", () => {
    const out = render(rows, { format: "json" });
    expect(out).not.toContain("\n");
    expect(JSON.parse(out)).toEqual(rows);
  });

  it("table has a header, separator and one line per row", () => {
    const out = render(rows, { format: "table" });
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/id\s+name/);
    expect(lines[1]).toMatch(/^-+\s+-+$/);
    expect(lines).toHaveLength(4);
  });

  it("csv quotes cells containing commas", () => {
    const out = render([{ a: "x,y", b: "z" }], { format: "csv" });
    expect(out).toBe('a,b\n"x,y",z');
  });

  it("yaml emits list items", () => {
    const out = render(rows, { format: "yaml" });
    expect(out).toContain("name: Ada");
    expect(out).toMatch(/^-$/m); // object array items render as a bare dash then indented keys
    expect(render(["a", "b"], { format: "yaml" })).toBe("- a\n- b");
  });

  it("respects --fields projection before rendering", () => {
    const out = render(rows, { format: "csv", fields: "name" });
    expect(out).toBe("name\nAda\nGrace");
  });
});
