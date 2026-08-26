import { describe, it, expect } from "vitest";
import { slugifyTag, deriveActionName, buildResourceCommands, queryOptKey } from "../src/generate";
import { ROUTE_REGISTRY, type RouteDef } from "../src/registry";

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

  // Regression: underscore filters (--campaign-ids et al) were silently dropped because the
  // action looked up camel(q.name) while commander stores the option under camel(kebab(name)).
  // The lookup key must equal commander's attributeName() for every generated query option.
  it("query flag lookup keys match commander's stored option keys for the whole registry", () => {
    for (const resource of commands) {
      for (const cmd of resource.commands) {
        for (const o of cmd.options) {
          if (!o.long?.startsWith("--")) continue;
          const flagBody = o.long.slice(2);
          // Reconstruct the registry name this flag could have come from; the invariant that
          // matters is that queryOptKey of the kebab form equals commander's attributeName.
          expect(queryOptKey(flagBody)).toBe(o.attributeName());
        }
      }
    }
  });

  it("maps underscore query names to the commander key (campaign_ids -> campaignIds)", () => {
    expect(queryOptKey("campaign_ids")).toBe("campaignIds");
    expect(queryOptKey("lead_statuses")).toBe("leadStatuses");
    expect(queryOptKey("providerId")).toBe("providerId");
    expect(queryOptKey("q")).toBe("q");
  });

  it("every registry query filter resolves through queryOptKey to a registered option", () => {
    const byTag = new Map(commands.map((c) => [c.name(), c]));
    for (const route of ROUTE_REGISTRY) {
      if (!route.query?.length) continue;
      const resource = byTag.get(slugifyTag(route.tag)) ?? commands.find((c) => c.aliases().includes(slugifyTag(route.tag)));
      if (!resource) continue;
      for (const q of route.query) {
        if (route.cursor && (q.name === "cursor" || q.name === "limit")) continue;
        const cmd = resource.commands.find((c) =>
          c.options.some((o) => o.attributeName() === queryOptKey(q.name))
        );
        expect(cmd, `no command in ${route.tag} registers a working flag for query '${q.name}' (${route.method} ${route.path})`).toBeTruthy();
      }
    }
  });
});
