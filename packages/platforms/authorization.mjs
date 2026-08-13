import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export class AuthorizationAcceptance {
  constructor(filePath = process.env.PUBLISH_AUTHORIZATION_PATH || ".data/authorization.json") { this.filePath = resolve(filePath); }
  buildChecklist(platform) { return { platform, checks: ["Account ownership confirmed", "Automation method is authorized", "One non-sensitive test article approved", "Public URL verification approved", "Security challenges require human takeover"], accepted: false }; }
  assertAccepted(record, platform) { if (!record?.accepted || !record?.acceptedBy || !record?.acceptedAt || !record?.platform || (platform && record.platform !== platform)) throw new Error(`Live publishing for ${platform || "this platform"} requires a recorded human authorization acceptance.`); return true; }
  async record(input) {
    const record = { ...this.buildChecklist(input.platform), ...input, accepted: true, acceptedAt: input.acceptedAt || new Date().toISOString() };
    this.assertAccepted(record, input.platform);
    await mkdir(dirname(this.filePath), { recursive: true });
    let records = {};
    try { records = JSON.parse(await readFile(this.filePath, "utf8")); } catch(error) { if (error?.code !== "ENOENT") throw error; }
    records[input.platform] = record;
    await writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return record;
  }
  async read(platform) { try { const records = JSON.parse(await readFile(this.filePath, "utf8")); return records[platform]; } catch(error) { if (error?.code === "ENOENT") return undefined; throw error; } }
  async assertPlatformAccepted(platform) { return this.assertAccepted(await this.read(platform), platform); }
}
