import type { DirectPublishPlatformKey } from "./types.js";

export const PUBLISH_PREFLIGHT_RULE_VERSION = "2026-08-12.1";

export type PublishPreflightIssueScope = "payload" | "official_platform_rule";
export type OfficialRuleCoverageStatus = "partial" | "not_verified";

export interface OfficialRuleSource {
  title: string;
  url: string;
  publisher: string;
  accessedAt: string;
}

export interface PublishPreflightIssue {
  code: string;
  message: string;
  scope: PublishPreflightIssueScope;
  sourceUrl?: string;
}

export interface OfficialRuleCoverage {
  status: OfficialRuleCoverageStatus;
  note: string;
  sources: OfficialRuleSource[];
}

export interface PublishContentPreflightResult {
  platform: DirectPublishPlatformKey;
  ruleVersion: string;
  passed: boolean;
  blockers: PublishPreflightIssue[];
  warnings: PublishPreflightIssue[];
  officialRuleCoverage: OfficialRuleCoverage;
  checkedAt: string;
}

export interface PublishContentPreflightInput {
  platform: DirectPublishPlatformKey;
  title: string;
  markdown: string;
  categoryId?: string;
  tagIds?: string[];
  coverMediaId?: string;
  checkedAt?: string;
}

const CSDN_PUBLISH_GUIDE_URL = "https://blog.csdn.net/blogdevteam/article/details/119778725";

const officialRuleCoverage: Record<DirectPublishPlatformKey, OfficialRuleCoverage> = {
  wechat: {
    status: "not_verified",
    note: "No stable, machine-verifiable public publishing constraints are bundled. The configured WeChat transport remains authoritative.",
    sources: []
  },
  juejin: {
    status: "not_verified",
    note: "No stable, machine-verifiable official publishing contract has been verified. No editorial preferences are inferred.",
    sources: []
  },
  csdn: {
    status: "partial",
    note: "The official publishing guide documents the editor workflow. Only fields represented by this engine can be checked; the platform response remains authoritative.",
    sources: [
      {
        title: "CSDN 博客创作中心使用指南",
        url: CSDN_PUBLISH_GUIDE_URL,
        publisher: "CSDN 博客开发团队",
        accessedAt: "2026-08-12"
      }
    ]
  },
  zhihu: {
    status: "not_verified",
    note: "No stable, machine-verifiable official publishing contract has been verified. No editorial preferences are inferred.",
    sources: []
  }
};

function cloneCoverage(platform: DirectPublishPlatformKey): OfficialRuleCoverage {
  const coverage = officialRuleCoverage[platform];
  return { ...coverage, sources: coverage.sources.map((source) => ({ ...source })) };
}

export function getOfficialRuleCoverage(platform: DirectPublishPlatformKey): OfficialRuleCoverage {
  return cloneCoverage(platform);
}

export function preflightPublishContent(input: PublishContentPreflightInput): PublishContentPreflightResult {
  const blockers: PublishPreflightIssue[] = [];
  const warnings: PublishPreflightIssue[] = [];

  if (!input.title.trim()) {
    blockers.push({ code: "payload_title_missing", message: "Title is required by the publish payload.", scope: "payload" });
  }
  if (!input.markdown.trim()) {
    blockers.push({ code: "payload_content_missing", message: "Content is required by the publish payload.", scope: "payload" });
  }

  if (input.platform === "csdn" && !input.tagIds?.some((tagId) => tagId.trim())) {
    warnings.push({
      code: "csdn_article_tags_unset",
      message: "CSDN's official editor workflow includes adding article tags. Confirm tags before publishing.",
      scope: "official_platform_rule",
      sourceUrl: CSDN_PUBLISH_GUIDE_URL
    });
  }

  return {
    platform: input.platform,
    ruleVersion: PUBLISH_PREFLIGHT_RULE_VERSION,
    passed: blockers.length === 0,
    blockers,
    warnings,
    officialRuleCoverage: cloneCoverage(input.platform),
    checkedAt: input.checkedAt || new Date().toISOString()
  };
}
