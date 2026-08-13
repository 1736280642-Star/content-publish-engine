#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JsonPublishRepository } from "../packages/publish-engine/json-repository.js";
import { PublishOrchestrator } from "../packages/publish-engine/orchestrator.js";
import { preflightPublishContent } from "../packages/publish-engine/content-preflight.js";
import { defaultPlatformRegistry } from "../packages/publish-engine/platform-registry.js";
import { buildPublishReliabilityMetrics } from "../packages/publish-engine/reliability.js";
import "../packages/publish-engine/adapters.js";

const result = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });
const articleSchema = z.object({ sourceId: z.string().optional(), title: z.string(), markdown: z.string(), summary: z.string().optional(), contentFormat: z.enum(["markdown", "html"]).optional(), scheduledAt: z.string().optional(), categoryId: z.string().optional(), tagIds: z.array(z.string()).optional(), assets: z.array(z.any()).optional(), metadata: z.record(z.string(), z.any()).optional() });

export function createPublishMcpServer(options = {}) {
  const repository = options.repository || new JsonPublishRepository(options.jobStorePath || process.env.PUBLISH_JSON_PATH || join(process.cwd(), ".data", "publish-state.json"));
  const registry = options.registry || defaultPlatformRegistry;
  const orchestrator = options.orchestrator || new PublishOrchestrator({ repository, registry, now: options.now });
  const server = new McpServer({ name: "content-publish-engine", version: "0.2.0" }, { instructions: "Publish completed articles, verify public URLs, and monitor post-publish liveness. The engine does not generate or rewrite content." });
  const register = (name, description, inputSchema, handler) => server.registerTool(name, { description, inputSchema }, async (input) => { try { return result(await handler(input)); } catch(error) { return { isError: true, ...result({ ok: false, error: error instanceof Error ? error.message : String(error) }) }; } });

  register("platform_list", "List registered publishing platforms and capabilities.", z.object({}), async () => ({ platforms: registry.list().map(({ key, displayName, capabilities }) => ({ key, displayName, capabilities })) }));
  register("platform_auth_probe", "Check an authorized platform session without returning credentials.", z.object({ platform: z.string() }), async ({ platform }) => registry.getAdapter(platform).checkAuth());
  register("publish_content_preflight", "Check payload completeness and sourced official platform rules without editorial preferences.", z.object({ platform: z.string(), title: z.string(), markdown: z.string(), tagIds: z.array(z.string()).optional() }), async (input) => preflightPublishContent(input));
  register("publish_job_create", "Create an idempotent immediate or scheduled publish job for a completed article.", z.object({ platform: z.string(), jobId: z.string().optional(), article: articleSchema.optional(), title: z.string().optional(), markdown: z.string().optional(), scheduledAt: z.string().optional(), sourceId: z.string().optional(), summary: z.string().optional(), tagIds: z.array(z.string()).optional(), categoryId: z.string().optional() }), async (input) => { const article = input.article || { title: input.title || "", markdown: input.markdown || "", scheduledAt: input.scheduledAt, sourceId: input.sourceId, summary: input.summary, tagIds: input.tagIds, categoryId: input.categoryId }; const preflight = preflightPublishContent({ platform: input.platform, title: article.title, markdown: article.markdown, tagIds: article.tagIds }); if (!preflight.passed) return { ok: false, preflight }; const created = await orchestrator.createJob({ platform: input.platform, article, jobId: input.jobId }); return { ok: true, ...created, preflight }; });
  register("publish_job_run", "Execute the external publish action once and immediately start verification.", z.object({ jobId: z.string() }), async ({ jobId }) => ({ ok: true, job: await orchestrator.runPublishJob(jobId) }));
  register("publish_job_get", "Read a durable publish job, attempts, and audit events.", z.object({ jobId: z.string() }), async ({ jobId }) => ({ job: await repository.getJob(jobId), attempts: await repository.listAttempts(jobId), audit: await repository.listAudit(jobId) }));
  register("publish_job_verify", "Perform read-only publication or liveness verification without republishing.", z.object({ jobId: z.string() }), async ({ jobId }) => ({ ok: true, job: await orchestrator.verifyPublishJob(jobId) }));
  register("publish_liveness_check", "Alias for read-only post-publish liveness verification.", z.object({ jobId: z.string() }), async ({ jobId }) => ({ ok: true, job: await orchestrator.verifyPublishJob(jobId) }));
  register("publish_run_due", "Run due verification jobs first, then due publish jobs.", z.object({ now: z.string().optional(), limit: z.number().optional() }), async (input) => ({ jobs: await orchestrator.runDuePublishJobs(input) }));
  register("publish_reliability", "Calculate platform publication and 24/72-hour survival metrics.", z.object({}), async () => ({ metrics: buildPublishReliabilityMetrics(await repository.listJobs(), await repository.listAttempts()) }));
  return server;
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invoked === import.meta.url) { void serveStdio(createPublishMcpServer); console.error("content-publish-engine MCP server running on stdio."); }
