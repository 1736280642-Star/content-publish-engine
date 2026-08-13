# Open-source release checklist

## Repository and safety

- [x] GitHub owner, repository, issue tracker, and homepage are declared in `package.json`.
- [x] MIT license and security policy are present.
- [x] Real publishing is disabled by default and requires a bridge token plus human authorization acceptance.
- [x] Current source is free of host-specific business modules and known legacy naming.
- [ ] Enable GitHub private vulnerability reporting.
- [ ] Scan Git history as well as the current tree before a public release.
- [ ] Confirm the npm package name is available.

## Engineering gates

- [x] Run `npm run check` on Node.js 24.
- [x] Test JSON and SQLite persistence and the publish-to-24/72-hour lifecycle.
- [x] Test HTTP, bridge, worker, webhook, asset, selector, and authorization surfaces.
- [ ] Validate on every supported Node.js release (22.5+).
- [ ] Run `npm audit --omit=dev` with network access.
- [ ] Inspect `npm pack --dry-run` and install the archive in an empty project.

## Release

- [x] Update `CHANGELOG.md` and package version together.
- [ ] Create GitHub release `v0.2.0`.
- [ ] Publish from CI with npm provenance.
- [ ] Retest public install instructions from a clean environment.
