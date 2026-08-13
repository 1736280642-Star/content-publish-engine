function failedStatus(status, payload) {
  const labels = { 2: "originality check failed", 3: "publication failed", 4: "platform review rejected", 5: "article was deleted by the operator", 6: "article was removed by the platform" };
  return {
    ok: false,
    status: status === 4 ? "manual_takeover_required" : "failed",
    publishStatus: status === 4 ? "pending_review" : "failed",
    failureCode: status === 4 ? "manual_takeover_required" : "adapter_failed",
    failureReason: `WeChat Official Account: ${labels[status] || `unknown publication status ${status}`}.${payload.fail_idx?.length ? ` Failed article indexes: ${payload.fail_idx.join(",")}.` : ""}`,
    nextAction: "Inspect the official account console. Create a new job only after confirming that no article was published."
  };
}

export function normalizeWechatPublishStatus(payload, publishId) {
  if (payload?.errcode && payload.errcode !== 0) {
    const permissionDenied = payload.errcode === 48001;
    return {
      ok: false,
      status: permissionDenied ? "pending_config" : "failed",
      publishStatus: "failed",
      externalTaskId: publishId,
      failureCode: permissionDenied ? "pending_config" : "adapter_failed",
      failureReason: `WeChat publication status request failed: ${payload.errmsg || payload.errcode}`,
      nextAction: permissionDenied ? "Confirm that the verified account has access to the free-publish API." : "Inspect the existing task; do not submit it again."
    };
  }
  const status = Number(payload?.publish_status);
  if (status === 0) {
    const detail = payload.article_detail || {};
    const item = Array.isArray(detail.item) ? detail.item[0] : undefined;
    const publicUrl = item?.article_url || item?.url;
    const articleId = detail.article_id || payload.article_id;
    return {
      ok: true,
      status: publicUrl ? "published_verified" : "published_pending_url",
      publishStatus: "confirmed",
      externalTaskId: publishId,
      platformArticleId: articleId ? String(articleId) : undefined,
      publicUrl,
      publicUrlPending: !publicUrl,
      nextAction: publicUrl ? "The article is public." : "Publication is confirmed; continue read-only URL verification."
    };
  }
  if (status === 1 || Number.isNaN(status)) return { ok: true, status: "pending_verify", publishStatus: "submitted", externalTaskId: publishId, publicUrlPending: true, nextAction: "The platform is processing the task; query status later without resubmitting." };
  return { ...failedStatus(status, payload), externalTaskId: publishId };
}

export async function verifyWechatPublish({ apiBase, accessToken, publishId, fetchJson }) {
  const url = new URL(`${apiBase}/cgi-bin/freepublish/get`);
  url.searchParams.set("access_token", accessToken);
  const { response, payload } = await fetchJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publish_id: publishId }) });
  if (!response.ok) return { ok: false, status: "pending_verify", publishStatus: "submitted", externalTaskId: publishId, publicUrlPending: true, failureCode: "verification_failed", failureReason: `WeChat publication status request returned HTTP ${response.status}.`, nextAction: "Restore connectivity and query the existing task; do not submit it again." };
  return normalizeWechatPublishStatus(payload, publishId);
}

export async function submitAndPollWechatPublish({ apiBase, accessToken, mediaId, fetchJson, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), pollAttempts = 10, pollIntervalMs = 3_000 }) {
  const url = new URL(`${apiBase}/cgi-bin/freepublish/submit`);
  url.searchParams.set("access_token", accessToken);
  const { response, payload } = await fetchJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ media_id: mediaId }) });
  if (!response.ok || payload?.errcode || !payload?.publish_id) {
    const permissionDenied = payload?.errcode === 48001;
    return { ok: false, status: permissionDenied ? "pending_config" : "failed", publishStatus: "failed", failureCode: permissionDenied ? "pending_config" : "adapter_failed", failureReason: `WeChat publication submission failed: ${payload?.errmsg || `HTTP ${response.status}`}`, nextAction: permissionDenied ? "Confirm that the verified account has access to the free-publish API." : "Inspect the draft and console; retry only after confirming no publication occurred." };
  }
  const publishId = String(payload.publish_id);
  let result = { ok: true, status: "pending_verify", publishStatus: "submitted", externalTaskId: publishId, publicUrlPending: true, nextAction: "The publication task was submitted and awaits official status." };
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    if (attempt > 0) await sleep(pollIntervalMs);
    result = await verifyWechatPublish({ apiBase, accessToken, publishId, fetchJson });
    if (result.status !== "pending_verify") return result;
  }
  return result;
}
