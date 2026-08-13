# Changelog

All notable changes are documented here. The project follows semantic versioning.

## 0.2.0 - 2026-08-12

- Reframed the package as a standalone article auto-publishing engine; content generation and host-specific business modules are no longer included.
- Added `PublishRepository`, JSON and SQLite persistence, atomic claims, leases, named locks, audit events, and a distributed-lock integration contract.
- Added `PublishOrchestrator`, due-job scheduling, a persistent worker, HTTP and MCP APIs, webhooks, and telemetry.
- Persisted the complete publish, URL discovery, 24-hour, 72-hour, stable, timeout, rejection, and removal lifecycle.
- Added an authenticated local bridge and a turnkey WeChat Official Account executor using the official draft and free-publish APIs.
- Added plugin registration, asset resolution/upload contracts, versioned official-rule metadata, external selector bundles, structure-change detection, and human authorization acceptance.
- Removed editorial assumptions about length, promotional wording, technical depth, and link counts.

## 0.1.0 - 2026-08-11

- Initial experimental extraction.
