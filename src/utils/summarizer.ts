// ─────────────────────────────────────────────────────────────
// 텍스트 정제 유틸리티
// (로컬 추출식 요약 알고리즘은 제거됨 — 요약은 geminiSummarizer가 담당)
// ─────────────────────────────────────────────────────────────

/**
 * HTML 태그 및 특수 HTML 엔티티(&quot;, &#39; 등)를 제거하는 유틸리티
 */
export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&[a-zA-Z0-9#]+;/g, " ").trim();
}
