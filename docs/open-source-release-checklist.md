# Open-source release checklist

Use this checklist before every public GitHub or npm release.

## Repository readiness

- [ ] Set the final GitHub owner and repository URL in `package.json` (`repository`, `bugs`, and `homepage`).
- [ ] Configure a private security-reporting contact and GitHub private vulnerability reporting.
- [ ] Confirm the package name is available before the first npm publish, or choose a scoped package name.
- [ ] Review `LICENSE` copyright ownership with the actual rights holder.
- [ ] Mark the first GitHub release as experimental `v0.1.0`.

## Safety and intellectual property

- [ ] Scan the current tree and Git history for credentials, cookies, private URLs, personal data, and unpublished customer content.
- [ ] Confirm no proprietary platform selectors, bypass logic, or internal business rules are included.
- [ ] Test that real publishing remains disabled by default.
- [ ] Review third-party dependency licenses and run `npm audit --omit=dev`.

## Engineering gates

- [ ] Run `npm ci` in a clean checkout.
- [ ] Run `npm run check` on Node.js 20 and 22.
- [ ] Run `npm pack --dry-run` and inspect every published file.
- [ ] Install the generated archive into an empty project and import all package entry points.
- [ ] Confirm `content-publish-engine-mcp` is installed as an executable.
- [ ] Exercise MCP create, run, restart, get, and verify behavior.

## Release and maintenance

- [ ] Update `CHANGELOG.md` and version numbers together.
- [ ] Create the GitHub release before publishing the npm package.
- [ ] Publish with provenance from CI rather than a developer workstation.
- [ ] Record platform-policy or bridge-contract changes as compatibility risks.
- [ ] After release, test the public install instructions from a separate machine or clean container.
