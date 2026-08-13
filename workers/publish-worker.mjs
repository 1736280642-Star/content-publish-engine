import { randomUUID } from "node:crypto";
import { createPublishRuntime } from "../packages/publish-engine/runtime.js";
import { pathToFileURL } from "node:url";

export async function runPublishWorker(options = {}) {
  const runtime = options.runtime || createPublishRuntime(); const intervalMs = Math.max(1_000, Number(options.intervalMs || process.env.PUBLISH_WORKER_INTERVAL_MS || 30_000)); const limit = Math.max(1, Number(options.limit || process.env.PUBLISH_WORKER_LIMIT || 20)); const workerId = options.workerId || `publish-worker-${randomUUID()}`; let stopped = false;
  const stop = () => { stopped = true; }; process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try { do { const jobs = await runtime.orchestrator.runDuePublishJobs({ limit, workerId }); options.onCycle?.({ workerId, processed: jobs.length, jobs }); if (options.once || stopped) break; await new Promise((resolve) => setTimeout(resolve, intervalMs)); } while (!stopped); }
  finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) runPublishWorker({ once: process.argv.includes("--once") }).catch((error) => { console.error(error); process.exitCode = 1; });
