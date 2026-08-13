import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JsonPublishRepository } from "../packages/publish-engine/json-repository.ts";
import { SqlitePublishRepository } from "../packages/publish-engine/sqlite-repository.ts";
import { PublishOrchestrator } from "../packages/publish-engine/orchestrator.ts";
import { PlatformRegistry } from "../packages/publish-engine/platform-registry.ts";
import { buildPublishReliabilityMetrics } from "../packages/publish-engine/reliability.ts";

function registryFor(adapter) { const registry = new PlatformRegistry(); registry.register({ key: "test", displayName: "Test", adapter: { platform: "test", validatePayload: async () => ({ ok: true, message: "ok", nextAction: "publish" }), ...adapter }, capabilities: { directPublish: true, scheduledPublish: true, publicUrlLookup: true, livenessCheck: true, coverUpload: false, inlineImageUpload: false } }); return registry; }
const article = { sourceId: "article-1", title: "Completed article", markdown: "Final body." };

test("orchestrator performs one publish action and persists the initial verification lifecycle", async () => {
  const repository = new JsonPublishRepository(join(mkdtempSync(join(tmpdir(), "publish-json-")), "state.json")); let publishCalls = 0; let verifyCalls = 0;
  const registry = registryFor({ checkAuth: async () => ({ ok: true, status: "ready", message: "ready", nextAction: "publish" }), publish: async (payload) => { publishCalls += 1; return { ok: true, status: "published_pending_url", mode: "real", publishStatus: "submitted", externalTaskId: "task-1", idempotencyKey: payload.idempotencyKey, publicUrlPending: true, nextAction: "verify" }; }, verify: async () => { verifyCalls += 1; return { ok: true, status: "published_verified", publishStatus: "confirmed", verifyStatus: "verified", platformArticleId: "post-1", publicUrl: "https://example.com/post-1", publicUrlPending: false, nextAction: "monitor" }; } });
  const orchestrator = new PublishOrchestrator({ repository, registry, now: () => new Date("2026-01-01T00:00:00.000Z") }); const created = await orchestrator.createJob({ platform: "test", article }); const job = await orchestrator.runPublishJob(created.job.id, "worker-1");
  assert.equal(publishCalls, 1); assert.equal(verifyCalls, 1); assert.equal(job.status, "public_observed"); assert.equal(job.publicUrl, "https://example.com/post-1"); assert.equal(job.firstPublicObservedAt, "2026-01-01T00:00:00.000Z"); assert.ok(job.nextVerificationAt); assert.equal((await repository.listAttempts(job.id)).length, 1);
});

test("end-to-end real publish reaches 24h and 72h survival without republishing", async () => {
  const repository = new SqlitePublishRepository(join(mkdtempSync(join(tmpdir(), "publish-e2e-")), "publish.db")); let now = new Date("2026-01-01T00:00:00.000Z"); let publishCalls = 0;
  const registry = registryFor({ checkAuth: async () => ({ ok: true, status: "ready", message: "ready", nextAction: "publish" }), publish: async (payload) => { publishCalls += 1; return { ok: true, status: "published_pending_url", mode: "real", publishStatus: "submitted", externalTaskId: "real-task", idempotencyKey: payload.idempotencyKey, nextAction: "verify" }; }, verify: async () => ({ ok: true, status: "published_verified", publishStatus: "confirmed", verifyStatus: "verified", platformArticleId: "real-post", publicUrl: "https://example.com/real-post", publicUrlPending: false, nextAction: "monitor" }) });
  const orchestrator = new PublishOrchestrator({ repository, registry, now: () => now }); const created = await orchestrator.createJob({ platform: "test", article, jobId: "request-1" }); const duplicate = await orchestrator.createJob({ platform: "test", article, jobId: "request-1" }); assert.equal(duplicate.created, false); assert.equal((await repository.listJobs()).length, 1); await orchestrator.runDuePublishJobs({ now: now.toISOString(), limit: 10, workerId: "worker" });
  now = new Date("2026-01-02T00:00:00.000Z"); await orchestrator.verifyPublishJob(created.job.id, "verify-24"); let job = await repository.getJob(created.job.id); assert.equal(job.status, "public_observed");
  now = new Date("2026-01-04T00:01:00.000Z"); job.nextVerificationAt = now.toISOString(); await repository.saveJob(job); await orchestrator.runDuePublishJobs({ now: now.toISOString(), limit: 10, workerId: "verify-72" }); job = await repository.getJob(created.job.id);
  assert.equal(job.status, "stable_published"); assert.equal(job.urlStatus, "stable"); assert.equal(publishCalls, 1); const metrics = buildPublishReliabilityMetrics(await repository.listJobs(), await repository.listAttempts()); assert.equal(metrics[0].survival24hRate, 1); assert.equal(metrics[0].survival72hRate, 1); repository.close();
  assert.ok(job.nextVerificationAt, "stable publications must continue daily liveness monitoring");
});

test("two failed liveness checks mark a previously public article removed", async () => {
  const repository = new JsonPublishRepository(join(mkdtempSync(join(tmpdir(), "publish-remove-")), "state.json")); let publicCheck = true;
  const registry = registryFor({ checkAuth: async () => ({ ok: true, status: "ready", message: "ready", nextAction: "publish" }), publish: async (payload) => ({ ok: true, status: "published_pending_url", mode: "real", publishStatus: "submitted", idempotencyKey: payload.idempotencyKey, nextAction: "verify" }), verify: async () => publicCheck ? { ok: true, status: "published_verified", verifyStatus: "verified", publicUrl: "https://example.com/post", nextAction: "monitor" } : { ok: false, status: "published_pending_url", verifyStatus: "pending", failureCode: "verification_failed", failureReason: "not found", nextAction: "check again" } });
  const orchestrator = new PublishOrchestrator({ repository, registry }); const created = await orchestrator.createJob({ platform: "test", article }); await orchestrator.runPublishJob(created.job.id, "run"); publicCheck = false; await orchestrator.verifyPublishJob(created.job.id, "v1"); const removed = await orchestrator.verifyPublishJob(created.job.id, "v2"); assert.equal(removed.status, "removed_after_publish"); assert.ok(removed.removedAt);
});
