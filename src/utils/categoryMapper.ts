import type { ArticleCategory } from "../interfaces/news.interface.js";

/**
 * 키워드 기반 카테고리 매핑
 */
export function mapCategory(keyword: string): ArticleCategory {
  const lower = keyword.toLowerCase();
  if (lower.includes("주식") || lower.includes("stock")) return "stock";
  if (lower.includes("코인") || lower.includes("coin")) return "coin";
  if (lower.includes("암호화폐") || lower.includes("crypto")) return "crypto";
  if (lower.includes("경제") || lower.includes("economy")) return "economy";
  return "general";
}
