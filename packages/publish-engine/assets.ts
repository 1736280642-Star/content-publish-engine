import { readFile } from "node:fs/promises";
import type { ArticleAssetInput, PublishPlatformKey } from "./types.js";

export interface ResolvedAsset { role: "cover" | "inline"; mediaId?: string; url?: string; bytes?: Uint8Array; mimeType?: string; alt?: string; }
export interface AssetResolver { resolve(asset: ArticleAssetInput, platform: PublishPlatformKey): Promise<ResolvedAsset>; }
export interface PlatformAssetUploader { upload(asset: ResolvedAsset): Promise<ResolvedAsset & { mediaId: string }>; }

export class DefaultAssetResolver implements AssetResolver {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async resolve(asset: ArticleAssetInput): Promise<ResolvedAsset> {
    if (asset.source.type === "platform_media") return { role: asset.role, mediaId: asset.source.mediaId, alt: asset.alt, mimeType: asset.mimeType };
    if (asset.source.type === "file") return { role: asset.role, bytes: await readFile(asset.source.path), alt: asset.alt, mimeType: asset.mimeType };
    const response = await this.fetcher(asset.source.url); if (!response.ok) throw new Error(`Asset download failed: HTTP ${response.status}`);
    return { role: asset.role, url: asset.source.url, bytes: new Uint8Array(await response.arrayBuffer()), alt: asset.alt, mimeType: asset.mimeType || response.headers.get("content-type") || undefined };
  }
}

export async function resolveAndUploadAssets(assets: ArticleAssetInput[] = [], platform: PublishPlatformKey, resolver: AssetResolver, uploader: PlatformAssetUploader) {
  const output: Array<ResolvedAsset & { mediaId: string }> = [];
  for (const asset of assets) { const resolved = await resolver.resolve(asset, platform); output.push(resolved.mediaId ? resolved as ResolvedAsset & { mediaId: string } : await uploader.upload(resolved)); }
  return output;
}
