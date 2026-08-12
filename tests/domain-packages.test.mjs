import assert from "node:assert/strict";
import test from "node:test";
import { callAiProvider } from "../packages/ai-provider/provider.ts";
import { resolvePromotionPlan } from "../packages/content-production/promotion-resolver.ts";
import { buildWechatLayout, getCalendarMonthBounds } from "../packages/free-production/compiler.ts";
import { collectContentMediaIds, rewriteContentMediaSources } from "../packages/platforms/media-rewrite.mjs";

test("free production calculates calendar-month bounds and accepts injected branding", () => {
  assert.deepEqual(getCalendarMonthBounds("2028-02"), { monthStart: "2028-02-01", monthEnd: "2028-02-29" });
  const layout = buildWechatLayout({
    selectedTitle: "Example",
    summary: "Summary",
    sections: [],
    brand: { name: "Example Brand", primaryColor: "#000000" }
  });
  assert.equal(layout[0].text, "Example Brand");
});

test("content production returns a deterministic empty CTA plan when promotion is disabled", () => {
  const plan = resolvePromotionPlan({
    task: {
      taskId: "task-no-cta",
      targetEntityIds: ["entity-1"],
      ctaIntent: "none",
      promotionRequired: false,
      channel: "wechat"
    },
    channelRule: { ctaRenderMode: "footer", maxCtaCount: 1 },
    profiles: [],
    approvedClaimIds: []
  });
  assert.deepEqual(plan.selectedVariants, []);
  assert.deepEqual(plan.selectionReasons, ["cta_intent_none"]);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
});

test("content media references are collected and rewritten without host-specific protocols", async () => {
  const id = "media-asset-123e4567-e89b-12d3-a456-426614174000";
  const input = `<img src="content-media://${id}">`;
  assert.deepEqual(collectContentMediaIds(input), [id]);
  assert.equal(await rewriteContentMediaSources(input, async () => "https://cdn.example.com/image.png"), '<img src="https://cdn.example.com/image.png">');
});

test("AI provider fails closed when credentials and model configuration are absent", async () => {
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.QWEN_MODEL;
  const result = await callAiProvider({ provider: "qwen", systemPrompt: "system", userPrompt: "user" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "pending_config");
  assert.deepEqual(result.missingConfig, ["DASHSCOPE_API_KEY", "QWEN_MODEL"]);
});
