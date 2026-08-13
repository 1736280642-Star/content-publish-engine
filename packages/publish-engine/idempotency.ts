import { createHash } from "node:crypto";
import type { PublishPlatformKey } from "./types.js";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashPublishContent(title: string, markdown: string) {
  const normalizedTitle = title.trim();
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n").trim();
  return sha256(`${normalizedTitle}\n\u0000\n${normalizedMarkdown}`);
}

export function buildPublishIdempotencyKey(jobId: string, platform: PublishPlatformKey, contentHash: string) {
  return sha256(`${jobId}:${platform}:${contentHash}`);
}

export function isValidPublishIdempotencyKey(
  idempotencyKey: string,
  jobId: string,
  platform: PublishPlatformKey,
  contentHash: string
) {
  return idempotencyKey === buildPublishIdempotencyKey(jobId, platform, contentHash);
}
