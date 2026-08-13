import type { PublishPlatformKey } from "./types.js";

export type PublishPreflightIssueScope = "payload" | "official_platform_rule";
export type OfficialRuleCoverageStatus = "verified" | "partial" | "not_verified";
export interface OfficialRuleSource { title: string; url: string; publisher: string; reviewedAt: string; }
export interface PublishPreflightIssue { code: string; message: string; scope: PublishPreflightIssueScope; sourceUrl?: string; }
export interface OfficialRuleSet { platform: PublishPlatformKey; version: string; effectiveAt: string; coverage: OfficialRuleCoverageStatus; note: string; sources: OfficialRuleSource[]; validate(input: PublishContentPreflightInput): { blockers?: PublishPreflightIssue[]; warnings?: PublishPreflightIssue[] }; }
export interface PublishContentPreflightInput { platform: PublishPlatformKey; title: string; markdown: string; categoryId?: string; tagIds?: string[]; checkedAt?: string; }
export interface PublishContentPreflightResult { platform: PublishPlatformKey; ruleVersion: string; passed: boolean; blockers: PublishPreflightIssue[]; warnings: PublishPreflightIssue[]; officialRuleCoverage: { status: OfficialRuleCoverageStatus; note: string; sources: OfficialRuleSource[] }; checkedAt: string; }

const rules = new Map<PublishPlatformKey, OfficialRuleSet>();
export function registerOfficialRuleSet(rule: OfficialRuleSet) { if (!rule.version || !rule.effectiveAt) throw new Error("Official rule sets require version and effectiveAt."); rules.set(rule.platform, rule); return rule; }
export function getOfficialRuleSet(platform: PublishPlatformKey) { return rules.get(platform); }

registerOfficialRuleSet({ platform: "csdn", version: "2026-08-12.1", effectiveAt: "2026-08-12", coverage: "partial", note: "The first-party editor guide documents article tags, but does not provide a stable public publishing API contract.", sources: [{ title: "CSDN Blog Creation Center User Guide", url: "https://blog.csdn.net/blogdevteam/article/details/119778725", publisher: "CSDN Blog Development Team", reviewedAt: "2026-08-12" }], validate(input) { return input.tagIds?.some((tag) => tag.trim()) ? {} : { warnings: [{ code: "csdn_article_tags_unset", message: "The first-party CSDN editor workflow includes article tags. Confirm tags before publishing.", scope: "official_platform_rule", sourceUrl: this.sources[0].url }] }; } });

export function preflightPublishContent(input: PublishContentPreflightInput): PublishContentPreflightResult {
  const blockers: PublishPreflightIssue[] = []; const warnings: PublishPreflightIssue[] = [];
  if (!input.title.trim()) blockers.push({ code: "payload_title_missing", message: "Title is required.", scope: "payload" });
  if (!input.markdown.trim()) blockers.push({ code: "payload_content_missing", message: "Article body is required.", scope: "payload" });
  const rule = rules.get(input.platform); if (rule) { const result = rule.validate(input); blockers.push(...(result.blockers || [])); warnings.push(...(result.warnings || [])); }
  return { platform: input.platform, ruleVersion: rule?.version || "unverified", passed: blockers.length === 0, blockers, warnings, officialRuleCoverage: rule ? { status: rule.coverage, note: rule.note, sources: structuredClone(rule.sources) } : { status: "not_verified", note: "No stable, machine-verifiable official publishing contract is bundled for this platform.", sources: [] }, checkedAt: input.checkedAt || new Date().toISOString() };
}

export function getOfficialRuleCoverage(platform: PublishPlatformKey) { return preflightPublishContent({ platform, title: "x", markdown: "x" }).officialRuleCoverage; }
