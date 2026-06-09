// ─────────────────────────────────────────────────────────────
// Gemini 기반 뉴스 요약 + 태그 분류 유틸리티
// 본문을 읽고 "한 문장 요약 + 성격 태그"를 동시에 생성한다.
// 실패/키 미설정 시 null을 반환한다 (로컬 폴백 없음).
// ─────────────────────────────────────────────────────────────
import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.js';
import type { ArticleTag } from '../interfaces/news.interface.js';

// API 키가 있을 때만 클라이언트를 1회 생성해 재사용한다.
const ai: GoogleGenAI | null = env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  : null;

// 허용 태그 (검증용)
const VALID_TAGS: readonly ArticleTag[] = [
  'MACRO',
  'EARNINGS',
  'INDUSTRY',
  'REGULATION',
  'ISSUE',
];

/** 요약 + 태그 결과 */
export interface SummaryResult {
  readonly summary: string;
  readonly tag: ArticleTag;
}

// ── 호출 간 최소 간격 보장(throttle) ─────────────────────────
// 스케줄러가 기사를 순차 처리하므로, 마지막 호출 시각만 추적해도 충분하다.
let lastCallAt = 0;
async function throttle(): Promise<void> {
  const interval = env.GEMINI_MIN_INTERVAL_MS;
  const wait = interval - (Date.now() - lastCallAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastCallAt = Date.now();
}

/** 머리기호/줄바꿈을 제거한 평문 한 문장으로 정규화 */
function normalizeSummary(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 뉴스 본문을 Gemini로 한 문장 요약하고 성격 태그를 분류한다.
 * 성공 시 { summary, tag }, 실패(키 없음/빈 본문/호출 오류/파싱 실패) 시 null을 반환한다.
 */
export async function summarizeWithGemini(content: string): Promise<SummaryResult | null> {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;

  if (!ai) {
    console.warn('  ⚠️ GEMINI_API_KEY 미설정 — 요약을 건너뜁니다.');
    return null;
  }

  // 전체 본문을 그대로 입력으로 사용 (비정상적으로 거대한 페이지만 안전 컷)
  const MAX_BODY_CHARS = 30000;
  const body = trimmed.length > MAX_BODY_CHARS ? trimmed.slice(0, MAX_BODY_CHARS) : trimmed;

  const prompt = [
    '다음 뉴스 기사 전체 본문을 읽고 두 가지를 한국어로 생성해줘.',
    '',
    '1) summary: 핵심을 평문 한 문장으로 요약 (머리기호·줄바꿈 없이, 마침표로 끝맺기, 추측 금지)',
    '2) tag: 아래 5개 중 기사 성격에 가장 맞는 하나',
    '   - MACRO: 금리·CPI·환율·FOMC 등 시장 전체에 영향을 주는 거시경제 뉴스',
    '   - EARNINGS: 어닝 서프라이즈·분기 실적 발표·대규모 수주 공시 뉴스',
    '   - INDUSTRY: AI 칩 수요·반도체 공급망 등 해당 섹터 전반의 트렌드 뉴스',
    '   - REGULATION: 정부 금융 규제·세금 정책·사법 리스크 관련 뉴스',
    '   - ISSUE: 경영진 교체·공장 화재·공급 계약 파기 등 개별 종목의 돌발 뉴스',
    '',
    '[기사 본문]',
    body,
  ].join('\n');

  try {
    await throttle();

    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        // 구조화 출력(JSON)으로 요약+태그를 한 번에 받는다.
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            tag: { type: Type.STRING, enum: [...VALID_TAGS] },
          },
          required: ['summary', 'tag'],
          propertyOrdering: ['summary', 'tag'],
        },
      },
    });

    const text = (response.text ?? '').trim();
    if (!text) return null;

    const parsed = JSON.parse(text) as { summary?: unknown; tag?: unknown };
    const summary = typeof parsed.summary === 'string' ? normalizeSummary(parsed.summary) : '';
    const tag = parsed.tag;

    if (summary.length === 0) return null;
    if (typeof tag !== 'string' || !VALID_TAGS.includes(tag as ArticleTag)) return null;

    return { summary, tag: tag as ArticleTag };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠️ Gemini 요약/분류 실패 — 요약 없이 진행: ${message}`);
    return null;
  }
}
