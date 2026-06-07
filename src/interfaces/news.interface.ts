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
