import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getPublishAdapter } from "../packages/publish-engine/adapters.ts";
import { preflightPublishContent, rewriteJuejinContentOnce } from "../packages/publish-engine/content-preflight.ts";
import { buildPublishIdempotencyKey, hashDirectPublishContent } from "../packages/publish-engine/idempotency.ts";
import { resolvePublishVerificationLifecycle, isPublishVerificationDue } from "../packages/publish-engine/lifecycle.ts";
import { createBrowserPublishJobStore } from "../packages/platforms/job-store.mjs";

const jobStorePath = process.env.PUBLISH_JOB_STORE_PATH || join(process.cwd(), ".data", "publish-jobs.json");
const jobStore = createBrowserPublishJobStore(jobStorePath, { leaseMs: 300_000 });

const resultCache = new Map();

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value
  };
}

function toolError(error) {
  return {
    isError: true,
    content: [{ type: "text", text: error instanceof Error ? error.message : "Publish tool failed." }],
    structuredContent: { ok: false, error: error instanceof Error ? error.message : String(error) }
  };
}

function buildPayload(input) {
  const contentHash = hashDirectPublishContent(input.title, input.markdown);
  const scheduleId = input.scheduleId || randomUUID();
  return {
    scheduleId,
    contentHash,
    idempotencyKey: buildPublishIdempotencyKey(scheduleId, input.platform, contentHash),
    title: input.title,
    markdown: input.markdown,
    scheduledAt: input.scheduledAt || new Date().toISOString(),
    sourceDraftId: input.draftId || scheduleId,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.tagIds ? { tagIds: input.tagIds } : {}),
    ...(input.coverMediaId ? { coverMediaId: input.coverMediaId } : {})
  };
}

export function createPublishMcpServer() {
  const server = new McpServer(
    { name: "content-publish-engine", version: "1.0.0" },
    {
      instructions:
        "Direct-SDK publish engine for multi-platform content distribution. " +
        "Tools cover auth probing, content preflight, job creation, publishing, and verification. " +
        "Never reproduce platform cookies, tokens, DOM selectors, or low-level click sequences."
    }
  );

  const register = (name, description, inputSchema, handler) =>
    server.registerTool(name, { description, inputSchema }, async (input) => {
      try {
        return toolResult(await handler(input));
      } catch (error) {
        return toolError(error);
      }
    });

  register(
    "platform_auth_probe",
    "Check whether a platform adapter is authenticated without returning credentials.",
    z.object({ platform: z.enum(["wechat", "juejin", "csdn", "zhihu"]) }),
    async ({ platform }) => {
      const adapter = getPublishAdapter(platform);
      return adapter.checkAuth();
    }
  );

  register(
    "publish_content_preflight",
    "Evaluate draft content against versioned platform publishing rules before submission.",
    z.object({
      platform: z.enum(["wechat", "juejin", "csdn", "zhihu"]),
      title: z.string(),
      markdown: z.string(),
      autoRewrite: z.boolean().optional()
    }),
    async (input) => {
      const result = preflightPublishContent({
        platform: input.platform,
        title: input.title,
        markdown: input.markdown
      });
      if (!result.passed && input.autoRewrite && input.platform === "juejin") {
        const rewritten = rewriteJuejinContentOnce({ title: input.title, markdown: input.markdown });
        const reChecked = preflightPublishContent({
          platform: input.platform,
          title: input.title,
          markdown: rewritten.markdown
        });
        return { ...reChecked, rewriteApplied: true, rewrittenMarkdown: rewritten.markdown };
      }
      return result;
    }
  );

  register(
    "publish_job_create",
    "Create an idempotent publish job from a final draft. Returns a durable job handle.",
    z.object({
      platform: z.enum(["wechat", "juejin", "csdn", "zhihu"]),
      title: z.string(),
      markdown: z.string(),
      scheduledAt: z.string().optional(),
      draftId: z.string().optional(),
      categoryId: z.string().optional(),
      tagIds: z.array(z.string()).optional(),
      coverMediaId: z.string().optional()
    }),
    async (input) => {
      const payload = buildPayload(input);
      const validation = await getPublishAdapter(input.platform).validatePayload(payload);
      if (!validation.ok) {
        return { ok: false, validation, nextAction: validation.nextAction };
      }
      const enqueued = jobStore.enqueue({
        platform: input.platform,
        idempotencyKey: payload.idempotencyKey,
        payload
      });
      return {
        ok: enqueued.created,
        jobId: enqueued.job.id,
        idempotencyKey: payload.idempotencyKey,
        alreadyExists: !enqueued.created,
        validation,
        nextAction: enqueued.created ? "Call publish_job_run to execute." : "Job already exists; call publish_job_get to inspect."
      };
    }
  );

  register(
    "publish_job_run",
    "Execute one publish job by calling the platform adapter directly. Returns the publish result.",
    z.object({ jobId: z.string() }),
    async ({ jobId }) => {
      const job = jobStore.getById(jobId);
      if (!job) {
        return { ok: false, error: `Job ${jobId} not found.` };
      }
      const cached = resultCache.get(jobId);
      if (cached) {
        return { ok: cached.ok, jobId, platform: job.platform, status: cached.status, message: "Job already executed.", result: cached };
      }
      const adapter = getPublishAdapter(job.platform);
      const payload = job.payload || {};
      const result = await adapter.publish(payload);
      resultCache.set(jobId, { ...result, platform: job.platform });
      return {
        ok: result.ok,
        jobId,
        platform: job.platform,
        status: result.status,
        mode: result.mode,
        publishStatus: result.publishStatus,
        platformArticleId: result.platformArticleId,
        externalTaskId: result.externalTaskId,
        externalDraftId: result.externalDraftId,
        editorUrl: result.editorUrl,
        publicUrl: result.publicUrl,
        failureCode: result.failureCode,
        failureReason: result.failureReason,
        nextAction: result.nextAction
      };
    }
  );

  register(
    "publish_job_get",
    "Read one publish job and its current status from the local job store.",
    z.object({ jobId: z.string() }),
    async ({ jobId }) => {
      const job = jobStore.getById(jobId);
      if (!job) {
        return { ok: false, error: `Job ${jobId} not found.` };
      }
      const cached = resultCache.get(jobId);
      return {
        ok: true,
        job,
        lastResult: cached || null
      };
    }
  );

  register(
    "publish_job_verify",
    "Verify a previously submitted publish job and resolve its public URL.",
    z.object({ jobId: z.string() }),
    async ({ jobId }) => {
      const job = jobStore.getById(jobId);
      if (!job) {
        return { ok: false, error: `Job ${jobId} not found.` };
      }
      const cached = resultCache.get(jobId);
      if (!cached) {
        return { ok: false, error: `No publish result found for job ${jobId}. Run publish_job_run first.` };
      }
      const adapter = getPublishAdapter(job.platform);
      const verified = await adapter.verify(cached);
      resultCache.set(jobId, { ...cached, ...verified, platform: job.platform });
      return {
        ok: verified.ok,
        jobId,
        platform: job.platform,
        status: verified.status,
        verifyStatus: verified.verifyStatus,
        publishStatus: verified.publishStatus,
        platformArticleId: verified.platformArticleId,
        publicUrl: verified.publicUrl,
        pendingCsvReturn: verified.pendingCsvReturn,
        failureCode: verified.failureCode,
        failureReason: verified.failureReason,
        nextAction: verified.nextAction
      };
    }
  );

  register(
    "publish_liveness_check",
    "Check whether an observed public article is still live and advance its lifecycle state.",
    z.object({
      jobId: z.string(),
      schedule: z.object({
        status: z.string().optional(),
        publicUrl: z.string().optional(),
        urlStatus: z.string().optional(),
        firstPublicObservedAt: z.string().optional(),
        verificationCount: z.number().optional(),
        consecutiveVerificationFailures: z.number().optional()
      }).optional()
    }),
    async ({ jobId, schedule: scheduleOverrides }) => {
      const job = jobStore.getById(jobId);
      if (!job) {
        return { ok: false, error: `Job ${jobId} not found.` };
      }
      const cached = resultCache.get(jobId);
      if (!cached) {
        return { ok: false, error: `No publish result found for job ${jobId}. Run publish_job_run first.` };
      }
      const adapter = getPublishAdapter(job.platform);
      const verified = await adapter.verify(cached);
      const baseSchedule = {
        id: jobId,
        platform: job.platform,
        status: scheduleOverrides?.status || cached.status,
        scheduledAt: job.payload?.scheduledAt || new Date().toISOString(),
        draftId: job.payload?.sourceDraftId || jobId,
        contentHash: job.payload?.contentHash || "",
        idempotencyKey: job.payload?.idempotencyKey || "",
        attemptIds: [],
        retryCount: 0,
        createdAt: job.createdAt || new Date().toISOString(),
        publicUrl: scheduleOverrides?.publicUrl || verified.publicUrl,
        urlStatus: scheduleOverrides?.urlStatus,
        firstPublicObservedAt: scheduleOverrides?.firstPublicObservedAt,
        verificationCount: scheduleOverrides?.verificationCount,
        consecutiveVerificationFailures: scheduleOverrides?.consecutiveVerificationFailures,
        ...scheduleOverrides
      };
      const lifecycle = resolvePublishVerificationLifecycle(baseSchedule, verified, new Date().toISOString());
      return {
        ok: true,
        jobId,
        platform: job.platform,
        lifecycle,
        verifyStatus: verified.verifyStatus,
        publicUrl: verified.publicUrl,
        nextAction: lifecycle.nextAction || verified.nextAction
      };
    }
  );

  register(
    "publish_verification_due",
    "Check whether a publish schedule is due for verification based on its nextVerificationAt.",
    z.object({
      nextVerificationAt: z.string(),
      now: z.string().optional()
    }),
    async ({ nextVerificationAt, now }) => {
      const schedule = { id: "check", platform: "wechat", status: "pending_verify", scheduledAt: new Date().toISOString(), draftId: "", contentHash: "", idempotencyKey: "", attemptIds: [], retryCount: 0, createdAt: new Date().toISOString(), nextVerificationAt };
      const checkAt = now ? new Date(now) : new Date();
      return {
        due: isPublishVerificationDue(schedule, checkAt),
        nextVerificationAt,
        checkedAt: checkAt.toISOString()
      };
    }
  );

  return server;
}

void serveStdio(createPublishMcpServer);
console.error("content-publish-engine MCP server running on stdio.");
