// Config + credential resolution. Precedence: explicit flag > env > stored profile.
// Stored profiles live in ~/.falcon/config.json so a user can keep several workspaces
// (e.g. `prod`, `staging`, per-client agency workspaces) and switch with --profile.
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "fs";

export const DEFAULT_BASE_URL = "http://localhost:3000";

export interface Profile {
  baseUrl?: string;
  apiKey?: string;
}

export interface ConfigFile {
  current: string;
  profiles: Record<string, Profile>;
}

export interface ResolvedAuth {
  baseUrl: string;
  apiKey: string;
  /** Where the apiKey came from — useful for `login`/`config` diagnostics. */
  source: "flag" | "env" | "profile" | "none";
  profileName: string;
}

// Config dir is overridable via FALCON_CONFIG_DIR (handy for scoping a CI run or an alternate home,
// and it keeps the unit tests hermetic). Resolved lazily so an env change between calls is honored.
function configDir(): string {
  return process.env.FALCON_CONFIG_DIR || join(homedir(), ".falcon");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadConfig(): ConfigFile {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as ConfigFile;
    if (!parsed.profiles) parsed.profiles = {};
    if (!parsed.current) parsed.current = "default";
    return parsed;
  } catch {
    return { current: "default", profiles: {} };
  }
}

export function saveConfig(cfg: ConfigFile): void {
  const dir = configDir();
  const path = configPath();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  // Best-effort: keep the file (which holds API keys) private. No-op / ignored on Windows.
  try {
    chmodSync(path, 0o600);
  } catch {
    /* platform without POSIX perms */
  }
}

export function setProfile(name: string, profile: Profile, makeCurrent = true): void {
  const cfg = loadConfig();
  cfg.profiles[name] = { ...cfg.profiles[name], ...profile };
  if (makeCurrent) cfg.current = name;
  saveConfig(cfg);
}

/** Options that can override stored config on any command. */
export interface AuthOverrides {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}

/**
 * Resolve the effective base URL + API key.
 * Key:     --api-key  > FALCON_API_KEY / MK_API_KEY  > profile.apiKey
 * BaseUrl: --base-url > FALCON_BASE_URL / API_BASE_URL > profile.baseUrl > default
 */
export function resolveAuth(overrides: AuthOverrides = {}): ResolvedAuth {
  const cfg = loadConfig();
  const profileName = overrides.profile || process.env.FALCON_PROFILE || cfg.current || "default";
  const profile = cfg.profiles[profileName] || {};

  const envKey = process.env.FALCON_API_KEY || process.env.MK_API_KEY || process.env.API_KEY;
  const envBase = process.env.FALCON_BASE_URL || process.env.API_BASE_URL;

  let apiKey = "";
  let source: ResolvedAuth["source"] = "none";
  if (overrides.apiKey) {
    apiKey = overrides.apiKey;
    source = "flag";
  } else if (envKey) {
    apiKey = envKey;
    source = "env";
  } else if (profile.apiKey) {
    apiKey = profile.apiKey;
    source = "profile";
  }

  const baseUrl = (
    overrides.baseUrl ||
    envBase ||
    profile.baseUrl ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  return { baseUrl, apiKey, source, profileName };
}
