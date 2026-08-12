import assert from "node:assert/strict";
import { access } from "node:fs/promises";

const contentProduction = await import("content-publish-engine/content-production");
const freeProduction = await import("content-publish-engine/free-production");
const publishEngine = await import("content-publish-engine/publish-engine");
const platforms = await import("content-publish-engine/platforms");
const aiProvider = await import("content-publish-engine/ai-provider");

assert.equal(typeof contentProduction.compileProductionContract, "function");
assert.equal(typeof freeProduction.getCalendarMonthBounds, "function");
assert.equal(typeof publishEngine.getPublishAdapter, "function");
assert.equal(typeof platforms.createBrowserPublishJobStore, "function");
assert.equal(typeof aiProvider.callAiProvider, "function");
await access(new URL("../dist/servers/publish-mcp-server.mjs", import.meta.url));

console.log("Built package entry points are importable.");
