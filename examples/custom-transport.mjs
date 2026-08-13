import { getPublishAdapter } from "content-publish-engine/publish-engine";

const transport = {
  async checkAuth(platform) {
    return { ok: true, status: "ready", message: `${platform} credentials are available in the host service.`, nextAction: "Publish an authorized article." };
  },
  async publish(platform, payload) {
    return {
      ok: true,
      status: "pending_verify",
      mode: "real",
      idempotencyKey: payload.idempotencyKey,
      externalTaskId: `${platform}:${payload.idempotencyKey}`,
      nextAction: "Verify the external task before any retry."
    };
  },
  async verify(_platform, result) {
    return {
      ok: true,
      status: "published_verified",
      verifyStatus: "verified",
      externalTaskId: result.externalTaskId,
      publicUrl: "https://example.com/published-article",
      nextAction: "Continue scheduled liveness checks."
    };
  }
};

const adapter = getPublishAdapter("wechat", transport);
console.log(await adapter.checkAuth());
