// ─────────────────────────────────────────────────────────────
// 텍스트 정제 및 로컬 3줄 요약 알고리즘 유틸리티
// ─────────────────────────────────────────────────────────────

/**
 * HTML 태그 및 특수 HTML 엔티티(&quot;, &#39; 등)를 제거하는 유틸리티
 */
export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&[a-zA-Z0-9#]+;/g, " ").trim();
}

/**
 * 로컬 기사 3줄 요약 알고리즘 (TF-IDF / 문장 순서 가중치 적용)
 * 완벽한 문장 마감을 선호하며, 미완성 문장(말줄임표 등)은 자동으로 정제 및 보정합니다.
 */
export function summarizeText(content: string): string {
  // 1) 문장 단위 분해 (마침표, 물음표, 느낌표 기준)
  const allSentences = content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (allSentences.length === 0) {
    return "요약할 본문 내용이 없습니다.";
  }

  // 완벽한 문장만 1차 필터링 (마침표/물음표/느낌표로 끝나되, ... 이나 … 로 끝나지 않는 것)
  let sentences = allSentences.filter((s) => {
    const isEllipsis = /(\.{2,}|…)$/.test(s);
    const hasProperEnd = /[.!?]$/.test(s);
    return !isEllipsis && hasProperEnd;
  });

  // 만약 완벽한 문장이 하나도 없다면, 차선책으로 전체 문장에서 말줄임표(...) 등을 제거/보정하여 사용
  if (sentences.length === 0) {
    sentences = allSentences
      .map((s) => {
        let cleaned = s.replace(/(\.{2,}|…)+$/, "").trim();
        if (cleaned && !/[.!?]$/.test(cleaned)) {
          cleaned += ".";
        }
        return cleaned;
      })
      .filter((s) => s.length > 10);
  }

  if (sentences.length === 0) {
    return "요약할 본문 내용이 없습니다.";
  }

  // 문장 수가 3개 이하인 경우 전체를 그대로 반환
  if (sentences.length <= 3) {
    return sentences.map((s) => `• ${s}`).join("\n");
  }

  // 2) 단어 빈도 분석
  const wordFreq: Record<string, number> = {};
  sentences.forEach((sentence) => {
    const words = sentence.split(/\s+/);
    words.forEach((word) => {
      const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]\"\'<>]/g, "").trim();
      // 한국어 조사/어미 제거를 위한 간단한 처리 (2글자 이상만 집계)
      if (cleanWord.length >= 2) {
        wordFreq[cleanWord] = (wordFreq[cleanWord] || 0) + 1;
      }
    });
  });

  // 3) 문장 중요도 점수 합산
  const scoredSentences = sentences.map((sentence, index) => {
    const words = sentence.split(/\s+/);
    let score = 0;
    words.forEach((word) => {
      const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]\"\'<>]/g, "").trim();
      if (cleanWord.length >= 2) {
        score += wordFreq[cleanWord] || 0;
      }
    });

    // 뉴스 기사 특성상 두괄식 가중치 부여 (앞 문장일수록 가중치)
    score += (sentences.length - index) * 0.2;

    return { sentence, score, originalIndex: index };
  });

  // 4) 상위 3개 문장 추출 및 원래 순서대로 재정렬
  const topThree = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((item) => `• ${item.sentence}`);

  return topThree.join("\n");
}
