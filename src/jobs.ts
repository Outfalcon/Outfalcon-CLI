// Async job following for `--wait`. Bulk operations return 202 { data: { job_id } }; we poll
// GET /api/v1/jobs/{id} until it reaches a terminal state, printing progress to stderr so stdout
// stays a clean JSON result.
import { FalconClient } from "./client";

export interface JobView {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  result?: unknown;
  error?: unknown;
  created_at?: string;
  updated_at?: string;
}

const TERMINAL = new Set(["completed", "failed"]);

export interface WaitOptions {
  intervalMs?: number;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

export async function waitForJob(
  client: FalconClient,
  jobId: string,
  opts: WaitOptions = {}
): Promise<JobView> {
  const interval = opts.intervalMs ?? 2000;
  const timeout = opts.timeoutMs ?? 15 * 60 * 1000;
  const log = opts.log ?? ((m) => process.stderr.write(m + "\n"));
  const start = Date.now();
  let lastProgress = -1;

  while (true) {
    const res = await client.request("get", `/jobs/${encodeURIComponent(jobId)}`);
    const job = res.data as JobView;

    if (typeof job.progress === "number" && job.progress !== lastProgress) {
      log(`… ${job.status} ${job.progress}%`);
      lastProgress = job.progress;
    } else if (lastProgress === -1) {
      log(`… ${job.status}`);
    }

    if (TERMINAL.has(job.status)) return job;

    if (Date.now() - start > timeout) {
      throw new Error(`Timed out after ${Math.round(timeout / 1000)}s waiting for job ${jobId} (last status: ${job.status})`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
