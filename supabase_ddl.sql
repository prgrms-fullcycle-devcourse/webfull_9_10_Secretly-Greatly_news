-- 0) 기존 테이블 삭제 (필요 시) ────────────────────────────────
DROP TABLE IF EXISTS news_summaries;

-- 1) 테이블 생성 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_articles (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    keyword       TEXT        NOT NULL,
    title         TEXT        NOT NULL,
    link          TEXT        NOT NULL UNIQUE,
    description   TEXT        NOT NULL DEFAULT '',
    pub_date      TEXT        NOT NULL,
    source        TEXT        NOT NULL DEFAULT '',
    summary       TEXT,
    tag           TEXT,
    collected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1-1) 기존 테이블에 tag 컬럼 추가 (이미 테이블이 있는 경우 마이그레이션) ──
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS tag TEXT;

-- 2) 조회 성능을 위한 인덱스 ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_news_articles_collected_at
    ON news_articles (collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_articles_keyword
    ON news_articles (keyword);


CREATE INDEX IF NOT EXISTS idx_news_articles_tag
    ON news_articles (tag);

-- 3) RLS 활성화 ──────────────────────────────────────────────
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

-- 4) RLS 정책: anon 사용자 → SELECT 만 허용 ─────────────────
CREATE POLICY "anon_select_only"
    ON news_articles
    FOR SELECT
    TO anon
    USING (true);

-- 5) RLS 정책: service_role → 모든 작업 허용 (INSERT/DELETE) ─
CREATE POLICY "service_role_full_access"
    ON news_articles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
