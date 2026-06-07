// ─────────────────────────────────────────────────────────────
// 뉴스 스케줄러: 수집 → 적재
// ─────────────────────────────────────────────────────────────
import cron from 'node-cron';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import type { NewsArticleInsert } from '../interfaces/news.interface.js';
import { stripHtmlTags, summarizeText } from '../utils/summarizer.js';
import { scrapeArticleDetails } from '../utils/scraper.js';
import { mapCategory } from '../utils/categoryMapper.js';
import { fetchNaverNews } from '../utils/naverApi.js';

// ── 1) Supabase 다건 삽입(INSERT) ─────────────────────────────
async function saveArticles(articles: NewsArticleInsert[]): Promise<void> {
  const { error } = await supabase
    .from('news_articles')
    .upsert(articles, { onConflict: 'link', ignoreDuplicates: true });

  if (error) {
    throw new Error(`Supabase INSERT 실패: ${error.message}`);
  }
}

// ── 2) 메인 작업(Job): 키워드별 수집 → 적재 ───────────────────
async function runNewsJob(): Promise<void> {
  const startTime = Date.now();
  console.log(`\n📰 [${new Date().toISOString()}] 뉴스 수집 작업 시작...`);

  for (const keyword of env.SEARCH_KEYWORDS) {
    try {
      console.log(`  🔍 키워드: "${keyword}" 수집 중...`);

      // 1) 네이버 뉴스 수집
      const rawArticles = await fetchNaverNews(keyword);

      if (rawArticles.length === 0) {
        console.log(`  ⚠️  "${keyword}" 검색 결과 없음 — 건너뜀`);
        continue;
      }

      // 2) HTML 정제 + 스크래핑 및 AI 요약 (호출 제한(Rate Limit) 우회를 위해 순차 처리)
      const category = mapCategory(keyword);
      const rawMapped: (NewsArticleInsert | null)[] = [];

      for (const item of rawArticles) {
        // 네이버 뉴스 링크(link)가 메타 태그가 잘 정리되어 있어 스크래핑에 더 유리합니다.
        const scrapeUrl = item.link || item.originallink;
        const { publisher, content } = await scrapeArticleDetails(scrapeUrl);

        // 언론사 이름을 못 찾은 경우 제외 (도메인 주소 등)
        if (!publisher) {
          rawMapped.push(null);
          continue;
        }

        // 본문을 긁어왔으면 본문 사용, 실패했으면 API가 제공하는 짧은 요약문(description) 사용
        const finalDescription = content ? content : stripHtmlTags(item.description);

        let summary: string | null = null;
        const textToSummarize = content ? content : stripHtmlTags(item.description);
        summary = summarizeText(textToSummarize);

        const finalLink = item.originallink || item.link;

        rawMapped.push({
          keyword,
          title: stripHtmlTags(item.title),
          link: finalLink,
          description: finalDescription,
          pub_date: item.pubDate,
          source: publisher,
          category,
          summary,
        });
      }

      // null로 매핑된 기사 필터링
      const articles: NewsArticleInsert[] = rawMapped.filter(
        (a): a is NewsArticleInsert => a !== null,
      );

      if (articles.length === 0) {
        console.log(`  ⚠️  "${keyword}" 유효한 기사(언론사명 추출 성공)가 없어 건너뜀`);
        continue;
      }

      // 3) Supabase 다건 삽입(INSERT)
      await saveArticles(articles);
      console.log(`  ✅ "${keyword}" 적재 완료 (${articles.length}건 유효)`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ "${keyword}" 처리 실패: ${message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`📰 뉴스 수집 작업 완료 (${elapsed}초)\n`);
}

// ── 3) 스케줄러 등록 ─────────────────────────────────────────
export function startScheduler(): void {
  cron.schedule('*/30 * * * *', () => {
    runNewsJob().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`🔥 스케줄러 치명적 오류: ${message}`);
    });
  });

  console.log('⏰ 뉴스 스케줄러 등록 완료 — 매 30분마다 실행');

  // 서버 기동 시 즉시 1회 실행 (초기 데이터 확보)
  console.log('🚀 초기 수집 시작...');
  runNewsJob().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🔥 초기 수집 실패: ${message}`);
  });
}
