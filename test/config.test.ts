import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resolveAuth } from "../src/config";

// resolveAuth reads process.env + the config file. Point FALCON_CONFIG_DIR at a fresh empty temp dir
// so the profile tier is always empty and these tests never see the developer's real ~/.falcon config.
const ENV_KEYS = ["FALCON_API_KEY", "MK_API_KEY", "API_KEY", "FALCON_BASE_URL", "API_BASE_URL", "FALCON_PROFILE", "FALCON_CONFIG_DIR"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.FALCON_CONFIG_DIR = mkdtempSync(join(tmpdir(), "falcon-cfg-"));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveAuth precedence", () => {
  it("flag beats env", () => {
    process.env.FALCON_API_KEY = "mk_live_env";
    const a = resolveAuth({ apiKey: "mk_live_flag" });
    expect(a.apiKey).toBe("mk_live_flag");
    expect(a.source).toBe("flag");
  });

  it("env is used when no flag", () => {
    process.env.MK_API_KEY = "mk_live_from_mk";
    const a = resolveAuth({});
    expect(a.apiKey).toBe("mk_live_from_mk");
    expect(a.source).toBe("env");
  });

  it("defaults base url and strips trailing slash from overrides", () => {
    const a = resolveAuth({ baseUrl: "https://send.savereplies.com/" });
    expect(a.baseUrl).toBe("https://send.savereplies.com");
    const b = resolveAuth({});
    expect(b.baseUrl).toBe("http://localhost:3000");
  });

  it("reports source none when nothing is set", () => {
    const a = resolveAuth({});
    expect(a.source).toBe("none");
    expect(a.apiKey).toBe("");
  });
});
