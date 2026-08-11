import type { AiProviderKey } from "./provider";

const providerRequiredEnv: Record<AiProviderKey, string[]> = {
  qwen: ["DASHSCOPE_API_KEY", "QWEN_MODEL"],
  deepseek: ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"],
  doubao: ["DOUBAO_API_KEY", "DOUBAO_MODEL"],
};

export function getMissingEnv(provider: AiProviderKey): string[] {
  const required = providerRequiredEnv[provider] || [];
  return required.filter((key) => !process.env[key]);
}

export function isProviderReady(provider: AiProviderKey): boolean {
  return getMissingEnv(provider).length === 0;
}
