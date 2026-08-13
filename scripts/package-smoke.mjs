import assert from "node:assert/strict";
import { access } from "node:fs/promises";

const publishEngine = await import("content-publish-engine/publish-engine");
const platforms = await import("content-publish-engine/platforms");

assert.equal(typeof publishEngine.PublishOrchestrator, "function");
assert.equal(typeof publishEngine.SqlitePublishRepository, "function");
assert.equal(typeof platforms.WechatOfficialApiExecutor, "function");
await access(new URL("../dist/servers/publish-mcp-server.mjs", import.meta.url));
await access(new URL("../dist/servers/publish-http-server.mjs", import.meta.url));
await access(new URL("../dist/servers/local-publish-bridge.mjs", import.meta.url));
await access(new URL("../dist/workers/publish-worker.mjs", import.meta.url));

console.log("Built package entry points are importable.");
