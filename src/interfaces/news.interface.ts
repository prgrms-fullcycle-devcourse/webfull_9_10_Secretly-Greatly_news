// ─────────────────────────────────────────────────────────────
// 모든 데이터의 엄격한 TypeScript 인터페이스 정의
// any 타입 사용 절대 금지
// ─────────────────────────────────────────────────────────────

// ── 환경변수 ────────────────────────────────────────────────

/** dotenv 로드 후 검증된 환경변수 */
export interface EnvConfig {
  readonly PORT: number;
  readonly SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly NAVER_CLIENT_ID: string;
  readonly NAVER_CLIENT_SECRET: string;
  readonly SEARCH_KEYWORDS: string[];
  readonly NEWS_DISPLAY_COUNT: number;
  readonly MAX_RECORDS_KEEP: number;
  /** Gemini API 키 (없으면 로컬 추출식 요약으로 폴백) */
  readonly GEMINI_API_KEY: string | null;
  /** 사용할 Gemini 모델명 (기본: gemini-2.5-flash) */
  readonly GEMINI_MODEL: string;
  /** Gemini 요약 호출 간 최소 간격(ms) — 분당 한도 회피용 (기본: 5000) */
  readonly GEMINI_MIN_INTERVAL_MS: number;
}

// ── 네이버 뉴스 API ────────────────────────────────────────

/** 네이버 뉴스 검색 API – 개별 기사 항목 */
export interface NaverNewsItem {
  readonly title: string;
  readonly originallink: string;
  readonly link: string;
  readonly description: string;
  readonly pubDate: string;
}

/** 네이버 뉴스 검색 API – 전체 응답 */
export interface NaverNewsResponse {
  readonly lastBuildDate: string;
  readonly total: number;
  readonly start: number;
  readonly display: number;
  readonly items: NaverNewsItem[];
}

// ── 기사 카테고리 ───────────────────────────────────────────

export type ArticleCategory = "stock" | "coin" | "crypto" | "economy" | "general";

// ── AI 분류 태그 ────────────────────────────────────────────
/**
 * AI가 본문을 읽고 부여하는 뉴스 성격 태그
 * - MACRO: 금리/CPI/환율/FOMC 등 시장 전체에 영향을 주는 거시경제 뉴스
 * - EARNINGS: 어닝 서프라이즈/분기 실적/대규모 수주 공시 뉴스
 * - INDUSTRY: 섹터 전반의 산업 동향·트렌드 뉴스
 * - REGULATION: 금융 규제/세금 정책/사법 리스크 등 규제·정책 뉴스
 * - ISSUE: 경영진 교체/공장 화재/계약 파기 등 개별 종목 돌발 뉴스
 */
export type ArticleTag = "MACRO" | "EARNINGS" | "INDUSTRY" | "REGULATION" | "ISSUE";

// ── Supabase 테이블 매핑 (news_articles) ────────────────────

/** news_articles 테이블 행 (SELECT 결과 매핑) */
export interface NewsArticleRow {
  readonly id: number;
  readonly keyword: string;
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly pub_date: string;
  readonly source: string;
  readonly category: ArticleCategory;
  readonly summary?: string | null;
  readonly tag?: ArticleTag | null;
  readonly collected_at: string;
}

/** news_articles INSERT 시 사용 (id, collected_at 제외) */
export interface NewsArticleInsert {
  readonly keyword: string;
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly pub_date: string;
  readonly source: string;
  readonly category: ArticleCategory;
  readonly summary?: string | null;
  readonly tag?: ArticleTag | null;
}

// ── API 응답 포맷 ───────────────────────────────────────────

/** GET /api/news/latest 성공 응답 */
export interface LatestNewsResponse {
  readonly success: true;
  readonly data: NewsArticleRow[];
  readonly count: number;
  readonly fetchedAt: string;
}

/** API 에러 응답 */
export interface ErrorResponse {
  readonly success: false;
  readonly error: string;
}
