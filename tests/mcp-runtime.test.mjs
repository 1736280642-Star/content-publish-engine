import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import { PlatformRegistry } from "../packages/publish-engine/platform-registry.ts";
import { createPublishMcpServer } from "../servers/publish-mcp-server.mjs";

async function createClient(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map(); let requestId = 0;
  clientTransport.onmessage = (message) => { if (!("id" in message)) return; const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); if ("error" in message) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result); };
  await clientTransport.start(); await server.connect(serverTransport);
  const request = (method, params) => new Promise((resolve, reject) => { const id = ++requestId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP request timed out: ${method}`)); }, 5_000); pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } }); void clientTransport.send({ jsonrpc: "2.0", id, method, params }); });
  await request("initialize", { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "publish-engine-test", version: "0.2.0" } });
  await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { async callTool(name, args) { const value = await request("tools/call", { name, arguments: args }); return value.structuredContent; }, async close() { await clientTransport.close(); await server.close(); } };
}

function registry() {
  const value = new PlatformRegistry();
  value.register({ key: "test", displayName: "Test", capabilities: { directPublish: true, scheduledPublish: true, publicUrlLookup: true, livenessCheck: true, coverUpload: false, inlineImageUpload: false }, adapter: { platform: "test", async checkAuth() { return { ok: true, status: "ready", message: "ready", nextAction: "publish" }; }, async validatePayload() { return { ok: true, message: "valid", nextAction: "publish" }; }, async publish(payload) { return { ok: true, status: "published_verified", mode: "real", publishStatus: "confirmed", idempotencyKey: payload.idempotencyKey, externalTaskId: "task", publicUrl: "https://example.test/mcp", nextAction: "monitor" }; }, async verify(result) { return { ok: true, status: "published_verified", publishStatus: "confirmed", verifyStatus: "verified", externalTaskId: result.externalTaskId, publicUrl: result.publicUrl, nextAction: "monitor" }; } } });
  return value;
}

test("MCP protocol creates, runs, restarts, reads, and verifies a durable job", async () => {
  const store = join(mkdtempSync(join(tmpdir(), "publish-mcp-")), "state.json"); const platforms = registry();
  const first = await createClient(createPublishMcpServer({ jobStorePath: store, registry: platforms, now: () => new Date("2026-01-01T00:00:00.000Z") }));
  const listed = await first.callTool("platform_list", {}); assert.equal(listed.platforms[0].key, "test");
  const created = await first.callTool("publish_job_create", { platform: "test", jobId: "mcp-request", title: "Completed article", markdown: "Final body" }); assert.equal(created.created, true); assert.equal(created.job.id, "mcp-request");
  const run = await first.callTool("publish_job_run", { jobId: created.job.id }); assert.equal(run.job.status, "public_observed"); await first.close();
  const restarted = await createClient(createPublishMcpServer({ jobStorePath: store, registry: platforms, now: () => new Date("2026-01-01T01:00:00.000Z") }));
  const restored = await restarted.callTool("publish_job_get", { jobId: created.job.id }); assert.equal(restored.job.publicUrl, "https://example.test/mcp"); assert.ok(restored.audit.length >= 3);
  const verified = await restarted.callTool("publish_job_verify", { jobId: created.job.id }); assert.equal(verified.job.status, "public_observed"); await restarted.close();
});
