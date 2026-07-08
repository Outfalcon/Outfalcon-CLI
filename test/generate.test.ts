import { describe, it, expect } from "vitest";
import { slugifyTag, deriveActionName, buildResourceCommands } from "../src/generate";
import type { RouteDef } from "../src/registry";

const r = (method: RouteDef["method"], path: string): RouteDef =>
  ({ method, path, tag: "X", summary: "", scope: "none" } as RouteDef);

describe("slugifyTag", () => {
  it("kebab-cases and handles &", () => {
    expect(slugifyTag("Email Accounts")).toBe("email-accounts");
    expect(slugifyTag("Lead List Groups")).toBe("lead-list-groups");
    expect(slugifyTag("Campaigns & Automation")).toBe("campaigns-and-automation");
  });
});

describe("deriveActionName", () => {
  it("maps CRUD shapes", () => {
    expect(deriveActionName(r("get", "/campaigns"))).toBe("list");
    expect(deriveActionName(r("get", "/campaigns/{id}"))).toBe("get");
    expect(deriveActionName(r("post", "/campaigns"))).toBe("create");
    expect(deriveActionName(r("patch", "/campaigns/{id}"))).toBe("update");
    expect(deriveActionName(r("delete", "/campaigns/{id}"))).toBe("delete");
  });

  it("uses literals for sub-resources and prefixes verbs on writes", () => {
    expect(deriveActionName(r("get", "/campaigns/{id}/leads"))).toBe("leads");
    expect(deriveActionName(r("get", "/campaigns/search-by-contact"))).toBe("search-by-contact");
    expect(deriveActionName(r("delete", "/campaigns/bulk"))).toBe("delete-bulk");
    expect(deriveActionName(r("post", "/campaigns/{id}/steps"))).toBe("create-steps");
  });
});

describe("buildResourceCommands", () => {
  const commands = buildResourceCommands();

  it("produces a resource per tag with unique action names", () => {
    expect(commands.length).toBeGreaterThan(20);
    for (const resource of commands) {
      const names = resource.commands.map((c) => c.name());
      expect(new Set(names).size, `duplicate action in ${resource.name()}`).toBe(names.length);
    }
  });

  it("exposes the async bulk-upsert with a --wait flag", () => {
    const leads = commands.find((c) => c.name() === "leads")!;
    const bulk = leads.commands.find((c) => c.name().includes("bulk-upsert"))!;
    expect(bulk).toBeTruthy();
    const flags = bulk.options.map((o) => o.long);
    expect(flags).toContain("--wait");
  });

  it("gives cursor routes --all/--cursor/--limit", () => {
    const leads = commands.find((c) => c.name() === "leads")!;
    const search = leads.commands.find((c) => c.name() === "search")!;
    const flags = search.options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(["--all", "--cursor", "--limit"]));
  });

  it("turns required body fields into flags (campaigns create --name)", () => {
    const campaigns = commands.find((c) => c.name() === "campaigns")!;
    const create = campaigns.commands.find((c) => c.name() === "create")!;
    const flags = create.options.map((o) => o.long);
    expect(flags).toContain("--name");
    expect(flags).toContain("--data");
  });
});
