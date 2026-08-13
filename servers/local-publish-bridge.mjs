import http from "node:http";
import { pathToFileURL } from "node:url";
import { AuthorizationAcceptance } from "../packages/platforms/authorization.mjs";
import { WechatOfficialApiExecutor } from "../packages/platforms/wechat-executor.mjs";

async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
function send(response, status, value) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }

export function createLocalPublishBridge(options = {}) {
  const executors = options.executors || new Map([["wechat", new WechatOfficialApiExecutor()]]);
  const token = options.token || process.env.PUBLISH_BRIDGE_TOKEN;
  const authorization = options.authorization || new AuthorizationAcceptance();
  const requireAcceptance = options.requireAcceptance ?? process.env.PUBLISH_REQUIRE_AUTHORIZATION_ACCEPTANCE !== "false";
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true, service: "content-publish-bridge", platforms: [...executors.keys()] });
      if (!token || request.headers.authorization !== `Bearer ${token}`) return send(response, 401, { ok: false, status: "auth_required", message: "Bridge token is invalid." });
      const input = await body(request); const executor = executors.get(input.platform);
      if (!executor) return send(response, 400, { ok: false, status: "failed", failureCode: "platform_not_supported", message: `No executor registered for ${input.platform}.` });
      if (request.method === "POST" && url.pathname === "/auth/check") { const result = await executor.checkAuth(); return send(response, result.ok ? 200 : 400, { ...result, authenticated: result.ok }); }
      if (request.method === "POST" && url.pathname === "/publish") {
        if (requireAcceptance) {
          try { await authorization.assertPlatformAccepted(input.platform); }
          catch(error) { return send(response, 403, { ok: false, status: "manual_takeover_required", failureCode: "manual_takeover_required", failureReason: error instanceof Error ? error.message : "Human authorization acceptance is missing.", nextAction: `Run npm run authorize -- ${input.platform} operator-name before live publishing.` }); }
        }
        const result = await executor.publish(input); return send(response, result.ok ? 200 : 400, result);
      }
      if (request.method === "POST" && url.pathname === "/publish/verify") { const result = await executor.verify(input); return send(response, result.ok || result.verifyStatus === "pending" ? 200 : 400, result); }
      return send(response, 404, { ok: false, message: "Not found." });
    } catch(error) { return send(response, 500, { ok: false, status: "failed", failureCode: "adapter_failed", failureReason: error instanceof Error ? error.message : String(error) }); }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PUBLISH_BRIDGE_PORT || 9528); createLocalPublishBridge().listen(port, "127.0.0.1", () => console.error(`content-publish-bridge listening on 127.0.0.1:${port}`));
}
