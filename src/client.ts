// Thin HTTP client over /api/v1. Same auth shape as the MCP server (x-api-key header), plus the
// ergonomics that make Falcon nicer than a raw curl: transparent rate-limit backoff, dry-run
// request printing, and error-envelope unwrapping into real Error messages.
import { randomUUID } from "crypto";

export class FalconError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "FalconError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  /** Set/override the Idempotency-Key header. */
  idempotencyKey?: string;
  /** Add an Idempotency-Key automatically for this (mutating) request when none is given. */
  autoIdempotency?: boolean;
  headers?: Record<string, string>;
}

export interface FalconResponse {
  status: number;
  /** Parsed `data` from the success envelope (or the raw JSON if unwrapped). */
  data: any;
  /** Parsed `meta` from the envelope, if present (pagination cursors, job status...). */
  meta: any;
  /** The full parsed JSON body (or undefined for 204). */
  raw: any;
  headers: Record<string, string>;
}

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  dryRun?: boolean;
  verbose?: boolean;
  /** Max automatic retries on HTTP 429 (rate limited). */
  maxRetries?: number;
  /** Sink for diagnostics; defaults to stderr so stdout stays pipeable. */
  log?: (msg: string) => void;
}

const MUTATING = new Set(["post", "put", "patch", "delete"]);

export class FalconClient {
  private baseUrl: string;
  private apiKey: string;
  private dryRun: boolean;
  private verbose: boolean;
  private maxRetries: number;
  private log: (msg: string) => void;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.dryRun = !!opts.dryRun;
    this.verbose = !!opts.verbose;
    this.maxRetries = opts.maxRetries ?? 5;
    this.log = opts.log ?? ((m) => process.stderr.write(m + "\n"));
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    // path is relative to /api/v1, e.g. "/campaigns/{id}" already substituted to "/campaigns/abc".
    const url = new URL(`${this.baseUrl}/api/v1${path.startsWith("/") ? path : "/" + path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === "") continue;
        if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
        else url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async request(method: string, path: string, opts: RequestOptions = {}): Promise<FalconResponse> {
    const m = method.toLowerCase();
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    };

    const idem =
      opts.idempotencyKey ||
      (opts.autoIdempotency && MUTATING.has(m) ? randomUUID() : undefined);
    if (idem) headers["Idempotency-Key"] = idem;

    const hasBody = opts.body !== undefined && MUTATING.has(m);
    const bodyStr = hasBody ? JSON.stringify(opts.body) : undefined;

    if (this.dryRun) {
      const redacted = { ...headers, "x-api-key": redact(this.apiKey) };
      this.log(`# dry-run — request NOT sent`);
      this.log(`${m.toUpperCase()} ${url}`);
      for (const [k, v] of Object.entries(redacted)) this.log(`${k}: ${v}`);
      if (bodyStr) this.log(`\n${JSON.stringify(opts.body, null, 2)}`);
      return { status: 0, data: null, meta: null, raw: null, headers: {} };
    }

    let attempt = 0;
    while (true) {
      if (this.verbose) this.log(`→ ${m.toUpperCase()} ${url}${idem ? ` (Idempotency-Key ${idem})` : ""}`);
      const res = await fetch(url, { method: m.toUpperCase(), headers, body: bodyStr });
      const resHeaders = headersToObject(res.headers);

      if (res.status === 429 && attempt < this.maxRetries) {
        const wait = retryAfterMs(res.headers);
        this.log(`⏳ rate limited (429); retrying in ${Math.ceil(wait / 1000)}s…`);
        await sleep(wait);
        attempt++;
        continue;
      }

      const text = await res.text();
      let json: any = undefined;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = text; // non-JSON body (shouldn't happen for /api/v1, but don't crash)
        }
      }

      if (res.status >= 400) {
        throw new FalconError(extractError(json) || `HTTP ${res.status}`, res.status, json);
      }

      const data = json && typeof json === "object" && "data" in json ? json.data : json ?? null;
      const meta = json && typeof json === "object" && "meta" in json ? json.meta : null;
      return { status: res.status, data, meta, raw: json, headers: resHeaders };
    }
  }
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => (out[k] = v));
  return out;
}

function retryAfterMs(h: Headers): number {
  const ra = h.get("retry-after");
  if (ra && /^\d+$/.test(ra.trim())) return Math.max(1000, parseInt(ra, 10) * 1000);
  const reset = h.get("x-ratelimit-reset");
  if (reset && /^\d+$/.test(reset.trim())) {
    // Reset may be epoch seconds or seconds-from-now; treat small values as a delta.
    const n = parseInt(reset, 10);
    const deltaFromEpoch = n * 1000 - Date.now();
    if (deltaFromEpoch > 0 && deltaFromEpoch < 120_000) return deltaFromEpoch;
    if (n > 0 && n <= 120) return n * 1000;
  }
  return 2000;
}

/** The API's error envelope is `{ error: { message } }`, but some legacy paths use `{ error: "..." }`. */
function extractError(json: any): string | undefined {
  if (!json) return undefined;
  if (typeof json === "string") return json;
  const e = json.error;
  if (!e) return undefined;
  if (typeof e === "string") return e;
  if (typeof e.message === "string") return e.message;
  return undefined;
}

function redact(key: string): string {
  if (!key) return "(none)";
  if (key.length <= 12) return key.slice(0, 4) + "…";
  return key.slice(0, 12) + "…";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
