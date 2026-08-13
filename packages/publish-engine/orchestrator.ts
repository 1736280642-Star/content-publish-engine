import { randomUUID } from "node:crypto";
import type { PublishAdapter, PublishResult, VerifyResult } from "./adapter-types.js";
import { publishEvent, RepositoryAuditSink, type PublishEventSink, type PublishEventType } from "./events.js";
import { buildPublishIdempotencyKey, hashPublishContent } from "./idempotency.js";
import { resolvePublishVerificationLifecycle } from "./lifecycle.js";
import { defaultPlatformRegistry, type PlatformRegistry } from "./platform-registry.js";
import type { PublishRepository } from "./repository.js";
import type { PlatformPublishPayload, PublishArticleInput, PublishAttempt, PublishJob, PublishJobStatus, PublishPlatformKey } from "./types.js";
import type { PublishTelemetry } from "./observability.js";
import { preflightPublishContent } from "./content-preflight.js";

export interface PublishOrchestratorOptions {
  repository: PublishRepository;
  registry?: PlatformRegistry;
  eventSink?: PublishEventSink;
  leaseMs?: number;
  now?: () => Date;
  telemetry?: PublishTelemetry;
}

export class PublishOrchestrator {
  readonly repository: PublishRepository;
  private readonly registry: PlatformRegistry;
  private readonly sink: PublishEventSink;
  private readonly leaseMs: number;
  private readonly clock: () => Date;
  private readonly telemetry?: PublishTelemetry;

  constructor(options: PublishOrchestratorOptions) {
    this.repository = options.repository;
    this.registry = options.registry || defaultPlatformRegistry;
    this.sink = options.eventSink || new RepositoryAuditSink(options.repository);
    this.leaseMs = options.leaseMs || 120_000;
    this.clock = options.now || (() => new Date());
    this.telemetry = options.telemetry;
  }

  private now() { return this.clock().toISOString(); }
  private adapter(platform: PublishPlatformKey): PublishAdapter { return this.registry.getAdapter(platform); }
  private async safelyVerify(adapter: PublishAdapter, result: PublishResult): Promise<VerifyResult> {
    try { return await adapter.verify(result); }
    catch (error) { return { ok: false, status: "pending_verify", publishStatus: result.publishStatus || "submitted", verifyStatus: "pending", platformArticleId: result.platformArticleId, externalTaskId: result.externalTaskId, publicUrl: result.publicUrl, publicUrlPending: !result.publicUrl, failureCode: "verification_failed", failureReason: error instanceof Error ? error.message : "Platform verification failed.", nextAction: "Restore platform access and verify the existing task; do not publish it again." }; }
  }
  private async emit(type: PublishEventType, job: PublishJob, details?: Record<string, unknown>) {
    this.telemetry?.increment("publish_events_total", { platform: job.platform, type });
    try { await this.sink.emit(publishEvent(type, job, details)); } catch { this.telemetry?.increment("publish_event_failures_total", { platform: job.platform, type }); }
  }

  async createJob(input: { platform: PublishPlatformKey; article: PublishArticleInput; jobId?: string }) {
    const plugin = this.registry.get(input.platform);
    if (!plugin) throw new Error(`Platform is not registered: ${input.platform}`);
    const now = this.now();
    const id = input.jobId || randomUUID();
    const scheduledAt = input.article.scheduledAt || now;
    if (Number.isNaN(Date.parse(scheduledAt))) throw new Error("scheduledAt must be an ISO-compatible date.");
    const contentHash = hashPublishContent(input.article.title, input.article.markdown);
    const job: PublishJob = { id, platform: input.platform, status: "scheduled", scheduledAt, article: structuredClone(input.article), contentHash, idempotencyKey: buildPublishIdempotencyKey(id, input.platform, contentHash), attemptIds: [], retryCount: 0, createdAt: now, updatedAt: now };
    const result = await this.repository.createJob(job);
    if (result.created) await this.emit("publish.job.created", result.job);
    return result;
  }

  private payload(job: PublishJob): PlatformPublishPayload {
    const article = job.article;
    return { jobId: job.id, contentHash: job.contentHash, idempotencyKey: job.idempotencyKey, title: article.title, markdown: article.markdown, summary: article.summary, contentFormat: article.contentFormat, scheduledAt: job.scheduledAt, sourceId: article.sourceId, categoryId: article.categoryId, tagIds: article.tagIds, assets: article.assets, metadata: article.metadata, platformDraftId: job.platformDraftId, editorUrl: job.editorUrl };
  }

  private attempt(job: PublishJob, overrides: Partial<PublishAttempt>): PublishAttempt {
    return { id: randomUUID(), jobId: job.id, platform: job.platform, contentHash: job.contentHash, idempotencyKey: job.idempotencyKey, status: "publishing", startedAt: this.now(), mode: "real", authStatus: "ready", payloadStatus: "valid", ...overrides };
  }

  private async persistAttempt(job: PublishJob, attempt: PublishAttempt, workerId: string) {
    job.attemptIds = [...new Set([...job.attemptIds, attempt.id])]; job.latestAttemptId = attempt.id; job.updatedAt = this.now();
    await this.repository.appendAttempt(attempt); return this.repository.saveJob(job, workerId);
  }

  private applyLifecycle(job: PublishJob, result: VerifyResult, verifiedAt: string) {
    const life = resolvePublishVerificationLifecycle(job, result, verifiedAt);
    Object.assign(job, life, { platformArticleId: result.platformArticleId || job.platformArticleId, externalTaskId: result.externalTaskId || job.externalTaskId, publicUrl: result.publicUrl || job.publicUrl, publicUrlPending: result.publicUrlPending ?? !result.publicUrl, publishedAt: ["published_pending_url", "public_observed", "stable_published"].includes(life.status) ? job.publishedAt || verifiedAt : job.publishedAt, updatedAt: verifiedAt });
    return life;
  }

  async runPublishJob(id: string, workerId = `worker-${process.pid}`) {
    const started = Date.now();
    const claimed = await this.repository.claimJob(id, workerId, this.leaseMs);
    if (!claimed) throw new Error(`Publish job is unavailable or leased: ${id}`);
    const lockKey = `platform-write:${claimed.platform}`;
    if (!(await this.repository.acquireLock(lockKey, workerId, this.leaseMs))) {
      await this.repository.saveJob(claimed, workerId);
      throw new Error(`Platform write lock is busy: ${claimed.platform}`);
    }
    try {
      if (claimed.status !== "scheduled" && claimed.status !== "failed" && claimed.status !== "precheck_failed") return this.repository.saveJob(claimed, workerId);
      const currentHash = hashPublishContent(claimed.article.title, claimed.article.markdown);
      if (currentHash !== claimed.contentHash) throw new Error("Article changed after job creation; create a new publish job.");
      const adapter = this.adapter(claimed.platform);
      const preflight = preflightPublishContent({ platform: claimed.platform, title: claimed.article.title, markdown: claimed.article.markdown, categoryId: claimed.article.categoryId, tagIds: claimed.article.tagIds, checkedAt: this.now() });
      if (!preflight.passed) {
        claimed.status = "precheck_failed"; claimed.failureCode = "payload_invalid"; claimed.failureReason = preflight.blockers.map((issue) => issue.message).join(" "); claimed.nextAction = "Resolve the sourced preflight blockers and create a new publish job.";
        return this.persistAttempt(claimed, this.attempt(claimed, { status: "precheck_failed", payloadStatus: "invalid", finishedAt: this.now(), failureCode: claimed.failureCode, failureReason: claimed.failureReason, nextAction: claimed.nextAction, diagnosticSummary: `rule_version=${preflight.ruleVersion}` }), workerId);
      }
      const auth = await adapter.checkAuth();
      if (!auth.ok) {
        claimed.status = auth.status === "manual_takeover_required" ? "risk_blocked" : auth.status === "auth_required" ? "auth_expired" : auth.status === "pending_config" ? "pending_config" : "failed";
        claimed.failureCode = auth.failureCode || (auth.status === "auth_required" ? "auth_required" : auth.status === "manual_takeover_required" ? "manual_takeover_required" : "adapter_failed"); claimed.failureReason = auth.message; claimed.nextAction = auth.nextAction;
        const attempt = this.attempt(claimed, { status: claimed.status as Exclude<PublishJobStatus, "scheduled">, authStatus: auth.status, payloadStatus: "valid", mode: "dry_run", finishedAt: this.now(), failureCode: claimed.failureCode, failureReason: claimed.failureReason, nextAction: claimed.nextAction });
        await this.emit(auth.status === "manual_takeover_required" ? "publish.manual_takeover_required" : auth.status === "auth_required" ? "publish.auth_required" : "publish.failed", claimed);
        return this.persistAttempt(claimed, attempt, workerId);
      }
      const validation = await adapter.validatePayload(this.payload(claimed));
      if (!validation.ok) {
        claimed.status = "precheck_failed"; claimed.failureCode = validation.failureCode || "payload_invalid"; claimed.failureReason = validation.message; claimed.nextAction = validation.nextAction;
        return this.persistAttempt(claimed, this.attempt(claimed, { status: "precheck_failed", payloadStatus: "invalid", finishedAt: this.now(), failureCode: claimed.failureCode, failureReason: claimed.failureReason, nextAction: claimed.nextAction }), workerId);
      }
      claimed.status = "publishing"; claimed.updatedAt = this.now(); await this.repository.saveJob(claimed, workerId); await this.emit("publish.started", claimed);
      const publishResult = await adapter.publish(this.payload(claimed));
      claimed.platformArticleId = publishResult.platformArticleId; claimed.externalTaskId = publishResult.externalTaskId; claimed.platformDraftId = publishResult.platformDraftId; claimed.editorUrl = publishResult.editorUrl; claimed.publicUrl = publishResult.publicUrl;
      if (!publishResult.ok) {
        claimed.status = publishResult.status === "manual_takeover_required" ? "risk_blocked" : publishResult.status; claimed.failureCode = publishResult.failureCode || "adapter_failed"; claimed.failureReason = publishResult.failureReason; claimed.nextAction = publishResult.nextAction;
        const attempt = this.attempt(claimed, { status: claimed.status as Exclude<PublishJobStatus, "scheduled">, mode: publishResult.mode, publishStatus: publishResult.publishStatus, finishedAt: this.now(), platformArticleId: publishResult.platformArticleId, externalTaskId: publishResult.externalTaskId, publicUrl: publishResult.publicUrl, failureCode: claimed.failureCode, failureReason: claimed.failureReason, nextAction: claimed.nextAction, diagnosticSummary: publishResult.diagnosticSummary });
        await this.emit(claimed.status === "risk_blocked" ? "publish.manual_takeover_required" : claimed.status === "platform_rejected" ? "publish.rejected" : "publish.failed", claimed);
        return this.persistAttempt(claimed, attempt, workerId);
      }
      await this.emit("publish.accepted", claimed);
      const verified = await this.safelyVerify(adapter, publishResult); const verifiedAt = this.now(); const life = this.applyLifecycle(claimed, verified, verifiedAt);
      const attempt = this.attempt(claimed, { status: life.status, mode: publishResult.mode, publishStatus: verified.publishStatus || publishResult.publishStatus, verifyStatus: verified.verifyStatus, finishedAt: verifiedAt, platformArticleId: verified.platformArticleId, externalTaskId: verified.externalTaskId, publicUrl: verified.publicUrl, urlStatus: life.urlStatus, verificationKind: "initial", publicUrlPending: verified.publicUrlPending, failureCode: verified.failureCode, failureReason: verified.failureReason, nextAction: verified.nextAction, diagnosticSummary: publishResult.diagnosticSummary });
      if (life.status === "public_observed") await this.emit("publish.public_observed", claimed); if (life.status === "stable_published") await this.emit("publish.stable", claimed);
      return this.persistAttempt(claimed, attempt, workerId);
    } finally {
      this.telemetry?.observe("publish_job_duration_ms", Date.now() - started, { platform: claimed.platform });
      await this.repository.releaseLock(lockKey, workerId);
    }
  }

  async verifyPublishJob(id: string, workerId = `verify-${process.pid}`) {
    const started = Date.now();
    const claimed = await this.repository.claimJob(id, workerId, this.leaseMs); if (!claimed) throw new Error(`Publish job is unavailable or leased: ${id}`);
    const attempts = await this.repository.listAttempts(id); const latest = attempts.at(-1);
    if (!latest && !claimed.externalTaskId && !claimed.platformArticleId && !claimed.publicUrl) throw new Error("No prior publish action can be verified safely.");
    const result: PublishResult = { ok: true, status: "pending_verify", mode: latest?.mode || "real", publishStatus: latest?.publishStatus || "submitted", platformArticleId: claimed.platformArticleId, externalTaskId: claimed.externalTaskId, platformDraftId: claimed.platformDraftId, editorUrl: claimed.editorUrl, publicUrl: claimed.publicUrl, idempotencyKey: claimed.idempotencyKey, publicUrlPending: claimed.publicUrlPending, nextAction: "Verify only; do not repeat the publish action." };
    const verified = await this.safelyVerify(this.adapter(claimed.platform), result); const verifiedAt = this.now(); const life = this.applyLifecycle(claimed, verified, verifiedAt);
    const attempt = this.attempt(claimed, { status: life.status, mode: latest?.mode || "real", publishStatus: verified.publishStatus || latest?.publishStatus, verifyStatus: verified.verifyStatus, finishedAt: verifiedAt, platformArticleId: verified.platformArticleId || claimed.platformArticleId, externalTaskId: verified.externalTaskId || claimed.externalTaskId, publicUrl: verified.publicUrl || claimed.publicUrl, urlStatus: life.urlStatus, verificationKind: claimed.firstPublicObservedAt ? "liveness" : "initial", publicUrlPending: verified.publicUrlPending, failureCode: verified.failureCode, failureReason: verified.failureReason, nextAction: verified.nextAction, diagnosticSummary: "verify_only_no_publish_action" });
    const event = life.status === "stable_published" ? "publish.stable" : life.status === "removed_after_publish" ? "publish.removed" : life.status === "public_observed" ? "publish.public_observed" : life.status === "platform_rejected" ? "publish.rejected" : undefined; if (event) await this.emit(event, claimed);
    const saved = await this.persistAttempt(claimed, attempt, workerId);
    this.telemetry?.observe("publish_verification_duration_ms", Date.now() - started, { platform: claimed.platform });
    return saved;
  }

  async runDuePublishJobs(input: { now?: string; limit?: number; workerId?: string } = {}) {
    const now = input.now || this.now(); const limit = input.limit || 20; const workerId = input.workerId || `scheduler-${process.pid}`;
    const all = await this.repository.listJobs(); const blocked = [...new Set(all.filter((job) => ["risk_blocked", "auth_expired", "manual_takeover_required"].includes(job.status)).map((job) => job.platform))];
    const verification = await this.repository.listDueVerificationJobs(now, limit); const attempts: PublishJob[] = [];
    const seen = new Set<string>();
    for (const job of verification) { const identity = `${job.platform}:${job.platformArticleId || job.publicUrl || job.id}`; if (seen.has(identity)) continue; seen.add(identity); attempts.push(await this.verifyPublishJob(job.id, workerId)); }
    const due = await this.repository.listDuePublishJobs(now, Math.max(0, limit - attempts.length), blocked);
    for (const job of due) attempts.push(await this.runPublishJob(job.id, workerId));
    return attempts;
  }
}
