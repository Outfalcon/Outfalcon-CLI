import { describe, it, expect, vi, afterEach } from "vitest";
import { FalconClient, FalconError } from "../src/client";
import { waitForJob } from "../src/jobs";

function jsonResponse(status: number, body: any, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => vi.restoreAllMocks());

const client = () => new FalconClient({ baseUrl: "http://x", apiKey: "mk_live_k", maxRetries: 3, log: () => {} });

describe("FalconClient.request", () => {
  it("unwraps the { data, meta } envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { data: [{ id: 1 }], meta: { next_cursor: "abc" } })
    );
    const res = await client().request("get", "/campaigns");
    expect(res.data).toEqual([{ id: 1 }]);
    expect(res.meta).toEqual({ next_cursor: "abc" });
  });

  it("throws FalconError with the nested error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(403, { error: { message: "API key lacks permission" } })
    );
    await expect(client().request("get", "/team")).rejects.toMatchObject({
      name: "FalconError",
      status: 403,
      message: "API key lacks permission",
    } satisfies Partial<FalconError>);
  });

  it("also handles a flat string error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(401, { error: "nope" }));
    await expect(client().request("get", "/x")).rejects.toThrow("nope");
  });

  it("retries on 429 honoring Retry-After, then succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(429, { error: { message: "slow down" } }, { "retry-after": "1" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    const res = await client().request("get", "/campaigns");
    expect(res.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10000);

  it("sends an auto Idempotency-Key on mutations when asked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(201, { data: {} }));
    await client().request("post", "/campaigns", { body: { name: "x" }, autoIdempotency: true });
    const headers = (fetchMock.mock.calls[0][1] as any).headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("dry-run does not call fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const dry = new FalconClient({ baseUrl: "http://x", apiKey: "k", dryRun: true, log: () => {} });
    const res = await dry.request("post", "/campaigns", { body: { name: "x" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(0);
  });
});

describe("waitForJob", () => {
  it("polls until a terminal status", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: "j1", status: "running", progress: 40 } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: "j1", status: "completed", progress: 100, result: { created: 5 } } }));
    const job = await waitForJob(client(), "j1", { intervalMs: 1, log: () => {} });
    expect(job.status).toBe("completed");
    expect(job.result).toEqual({ created: 5 });
  });
});
