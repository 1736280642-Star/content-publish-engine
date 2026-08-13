import type { PlatformPlugin, PublishAdapter } from "./adapter-types.js";
import type { PlatformPublishPayload } from "./types.js";

export function createWechatOfficialApiPlugin(executor: { checkAuth(): Promise<any>; publish(payload: PlatformPublishPayload): Promise<any>; verify(result: any): Promise<any> }): PlatformPlugin {
  const adapter: PublishAdapter = { platform: "wechat", checkAuth: () => executor.checkAuth(), validatePayload: async (payload) => !payload.title.trim() || !payload.markdown.trim() ? { ok: false, message: "Title and body are required.", nextAction: "Complete the article.", failureCode: "payload_invalid" } : { ok: true, message: "WeChat payload is valid.", nextAction: "Publish with the official API." }, publish: (payload) => executor.publish(payload), verify: (result) => executor.verify(result) };
  return { key: "wechat", displayName: "WeChat Official Account", adapter, capabilities: { directPublish: true, scheduledPublish: false, publicUrlLookup: true, livenessCheck: true, coverUpload: false, inlineImageUpload: false } };
}
