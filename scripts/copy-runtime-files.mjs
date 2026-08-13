import { cp, mkdir } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const distRoot = new URL("../dist/", import.meta.url);

await mkdir(distRoot, { recursive: true });
await cp(new URL("packages/platforms/", projectRoot), new URL("packages/platforms/", distRoot), { recursive: true });
await cp(new URL("servers/", projectRoot), new URL("servers/", distRoot), { recursive: true });
await cp(new URL("workers/", projectRoot), new URL("workers/", distRoot), { recursive: true });
await cp(new URL("scripts/authorize-platform.mjs", projectRoot), new URL("scripts/authorize-platform.mjs", distRoot));
