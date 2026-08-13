import http from "node:http";
import { createPublishRuntime } from "../packages/publish-engine/runtime.js";
import { buildPublishReliabilityMetrics } from "../packages/publish-engine/reliability.js";
import { pathToFileURL } from "node:url";

async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
function send(response, status, value) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }

export function createPublishHttpServer(options = {}) {
  const runtime = options.runtime || createPublishRuntime();
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true, service: "content-publish-engine" });
      if (request.method === "GET" && url.pathname === "/v1/platforms") return send(response, 200, { platforms: runtime.registry.list().map(({ key, displayName, capabilities }) => ({ key, displayName, capabilities })) });
      if (request.method === "GET" && url.pathname === "/v1/telemetry") return send(response, 200, runtime.telemetry.snapshot());
      if (request.method === "POST" && url.pathname === "/v1/jobs") { const input = await body(request); const result = await runtime.orchestrator.createJob({ platform: input.platform, article: input.article, jobId: input.jobId }); return send(response, result.created ? 201 : 200, result); }
      if (request.method === "GET" && url.pathname === "/v1/jobs") return send(response, 200, { jobs: await runtime.repository.listJobs({ platform: url.searchParams.get("platform") || undefined, status: url.searchParams.get("status") || undefined }) });
      const match = url.pathname.match(/^\/v1\/jobs\/([^/]+)(?:\/(run|verify))?$/);
      if (match && request.method === "GET" && !match[2]) { const job = await runtime.repository.getJob(match[1]); return send(response, job ? 200 : 404, job || { error: "Job not found." }); }
      if (match && request.method === "POST" && match[2] === "run") return send(response, 200, await runtime.orchestrator.runPublishJob(match[1]));
      if (match && request.method === "POST" && match[2] === "verify") return send(response, 200, await runtime.orchestrator.verifyPublishJob(match[1]));
      if (request.method === "POST" && url.pathname === "/v1/run-due") return send(response, 200, { jobs: await runtime.orchestrator.runDuePublishJobs(await body(request)) });
      if (request.method === "GET" && url.pathname === "/v1/reliability") return send(response, 200, { metrics: buildPublishReliabilityMetrics(await runtime.repository.listJobs(), await runtime.repository.listAttempts()) });
      return send(response, 404, { error: "Not found." });
    } catch(error) { return send(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const port = Number(process.env.PUBLISH_HTTP_PORT || 8787); createPublishHttpServer().listen(port, "127.0.0.1", () => console.error(`content-publish-engine HTTP listening on 127.0.0.1:${port}`)); }
