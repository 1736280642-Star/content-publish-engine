import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import { createPublishMcpServer } from "../servers/publish-mcp-server.mjs";

async function createClient(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map();
  let requestId = 0;

  clientTransport.onmessage = (message) => {
    if (!("id" in message)) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if ("error" in message) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  };

  await clientTransport.start();
  await server.connect(serverTransport);

  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 5_000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      }
    });
    void clientTransport.send({ jsonrpc: "2.0", id, method, params });
  });

  await request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "content-publish-engine-test", version: "0.1.0" }
  });
  await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  return {
    callTool: async (name, args) => {
      const result = await request("tools/call", { name, arguments: args });
      return result.structuredContent;
    },
    close: async () => {
      await clientTransport.close();
      await server.close();
    }
  };
}

test("MCP create, run, restart, get, and verify lifecycle is durable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "content-publish-mcp-integration-"));
  const jobStorePath = join(directory, "jobs.json");
  const firstServer = createPublishMcpServer({ jobStorePath });
  const firstClient = await createClient(firstServer);

  const created = await firstClient.callTool("publish_job_create", {
    platform: "wechat",
    title: "Durable MCP publish job",
    markdown: "Short body."
  });
  assert.equal(created.ok, true);
  assert.equal(created.preflight.passed, true);
  assert.equal(created.preflight.officialRuleCoverage.status, "not_verified");

  const run = await firstClient.callTool("publish_job_run", { jobId: created.jobId });
  assert.equal(run.ok, true);
  assert.equal(run.status, "published_pending_url");

  const firstRead = await firstClient.callTool("publish_job_get", { jobId: created.jobId });
  assert.equal(firstRead.job.status, "completed");
  assert.equal(firstRead.job.payload, undefined);
  assert.equal(firstRead.lastResult.idempotencyKey, created.idempotencyKey);
  await firstClient.close();

  const restartedServer = createPublishMcpServer({ jobStorePath });
  const restartedClient = await createClient(restartedServer);
  const restored = await restartedClient.callTool("publish_job_get", { jobId: created.jobId });
  assert.equal(restored.lastResult.idempotencyKey, created.idempotencyKey);

  const verified = await restartedClient.callTool("publish_job_verify", { jobId: created.jobId });
  assert.equal(verified.ok, true);
  assert.equal(verified.verifyStatus, "pending");
  await restartedClient.close();
});
