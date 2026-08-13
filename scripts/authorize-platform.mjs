#!/usr/bin/env node
import { AuthorizationAcceptance } from "../packages/platforms/authorization.mjs";

const [platform, acceptedBy] = process.argv.slice(2);
if (!platform || !acceptedBy) {
  console.error("Usage: content-publish-engine-authorize <platform> <operator-name>");
  process.exitCode = 1;
} else {
  const acceptance = new AuthorizationAcceptance();
  const record = await acceptance.record({ platform, acceptedBy });
  console.log(JSON.stringify({ ok: true, platform: record.platform, acceptedBy: record.acceptedBy, acceptedAt: record.acceptedAt }, null, 2));
}
