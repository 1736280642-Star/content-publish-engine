import { readFile } from "node:fs/promises";

export class SelectorRegistry {
  constructor(options = {}) { this.expectedSchemaVersion = options.schemaVersion || 1; this.bundles = new Map(); }
  async loadFile(filePath) { const bundle = JSON.parse(await readFile(filePath, "utf8")); return this.register(bundle); }
  register(bundle) { if (!bundle?.platform || !bundle?.version || bundle.schemaVersion !== this.expectedSchemaVersion || typeof bundle.selectors !== "object") throw new Error("Invalid selector bundle."); this.bundles.set(bundle.platform, structuredClone(bundle)); return bundle; }
  get(platform) { return structuredClone(this.bundles.get(platform)); }
  detectStructureChange(platform, observations) { const bundle = this.bundles.get(platform); if (!bundle) return { changed: true, code: "selector_bundle_missing", missing: [] }; const missing = Object.entries(bundle.selectors).filter(([, selector]) => selector?.required && !observations?.[selector.name || selector.selector]).map(([name]) => name); return { changed: missing.length > 0, code: missing.length ? "platform_structure_changed" : "structure_compatible", selectorVersion: bundle.version, missing }; }
}
