const CONTENT_MEDIA_PATTERN = /content-media:\/\/(media-asset-[0-9a-f-]{36})/gi;

export function collectContentMediaIds(html) {
  return Array.from(new Set(Array.from(String(html || "").matchAll(CONTENT_MEDIA_PATTERN), (match) => match[1])));
}

export async function rewriteContentMediaSources(html, resolveUrl) {
  let output = String(html || "");
  const ids = collectContentMediaIds(output);
  for (const id of ids) {
    const url = String(await resolveUrl(id) || "").trim();
    if (!/^https:\/\//i.test(url)) throw new Error(`Asset ${id} did not resolve to a valid HTTPS content image URL.`);
    output = output.split(`content-media://${id}`).join(url);
  }
  if (/content-media:\/\//i.test(output)) throw new Error("Content still contains unresolved media references.");
  return output;
}
