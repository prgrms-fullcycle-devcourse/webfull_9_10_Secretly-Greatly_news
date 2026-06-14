// ─────────────────────────────────────────────────────────────
// 뉴스 스케줄러: 수집 → 적재
// ─────────────────────────────────────────────────────────────
import cron from 'node-cron';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import type { NewsArticleInsert } from '../interfaces/news.interface.js';
import { stripHtmlTags } from '../utils/summarizer.js';
import { summarizeWithGemini } from '../utils/geminiSummarizer.js';
import { scrapeArticleDetails } from '../utils/scraper.js';
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

// ── 1-2) 이미 적재된 link 조회 (중복 재요약 방지) ─────────────
/**
 * 주어진 link 목록 중 DB(news_articles)에 이미 존재하는 link의 Set을 반환한다.
 * 이를 통해 같은 기사를 매시간 다시 스크래핑/AI 요약하는 비용 낭비를 막는다.
 */
async function fetchExistingLinks(links: string[]): Promise<Set<string>> {
  if (links.length === 0) return new Set();

  const { data, error } = await supabase
    .from('news_articles')
    .select('link')
    .in('link', links);

  if (error) {
    // 조회 실패 시에는 (안전하게) 빈 Set 반환 — 최악의 경우 일부 재요약만 발생
    console.warn(`  ⚠️ 기존 link 조회 실패 — 중복 필터 생략: ${error.message}`);
    return new Set();
  }

  return new Set((data ?? []).map((row: { link: string }) => row.link));
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

      // 2) 중복 제거: DB에 이미 있는 link는 스크래핑/AI 요약 전에 걸러낸다.
      //    (저장 키와 동일하게 originallink 우선으로 link를 산정)
      const candidateLinks = rawArticles.map((item) => item.originallink || item.link);
      const existingLinks = await fetchExistingLinks(candidateLinks);
      const newArticles = rawArticles.filter(
        (item) => !existingLinks.has(item.originallink || item.link),
      );

      const skipped = rawArticles.length - newArticles.length;
      if (newArticles.length === 0) {
        console.log(`  ⏭️  "${keyword}" 신규 기사 없음 (${skipped}건 중복) — 건너뜀`);
        continue;
      }
      if (skipped > 0) {
        console.log(`  ♻️  "${keyword}" 중복 ${skipped}건 건너뜀, 신규 ${newArticles.length}건 처리`);
      }

      // 3) 신규 기사만 스크래핑 + AI 요약 (Rate Limit 회피 위해 순차 처리)
      const rawMapped: (NewsArticleInsert | null)[] = [];

      for (const item of newArticles) {
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
        const textToSummarize = content ? content : stripHtmlTags(item.description);

        // AI 요약 + 태그 분류 (실패 시 null) — 요약을 못 만든 기사는 적재에서 제외한다.
        const result = await summarizeWithGemini(textToSummarize);
        if (!result) {
          rawMapped.push(null);
          continue;
        }

        const finalLink = item.originallink || item.link;

        rawMapped.push({
          keyword,
          title: stripHtmlTags(item.title),
          link: finalLink,
          description: finalDescription,
          pub_date: item.pubDate,
          source: publisher,
          summary: result.summary,
          tag: result.tag,
        });
      }

      // null로 매핑된 기사 필터링 (언론사명 추출 실패 또는 요약 실패)
      const articles: NewsArticleInsert[] = rawMapped.filter(
        (a): a is NewsArticleInsert => a !== null,
      );

      if (articles.length === 0) {
        console.log(`  ⚠️  "${keyword}" 적재할 유효한 기사가 없어 건너뜀`);
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

// ── 3) 전날 데이터 삭제 작업 ────────────────────────────────────
/**
 * 한국 시간(KST) 기준 오늘의 00시 00분 00초에 해당하는 UTC Date 객체를 반환합니다.
 */
function getKstTodayStart(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateString = `${year}-${pad(month + 1)}-${pad(day)}T00:00:00+09:00`;
  return new Date(dateString);
}

async function cleanPreviousDaysArticles(): Promise<void> {
  try {
    const todayStartKst = getKstTodayStart();
    console.log(`\n🧹 [정리] 한국 시간 기준 오늘 0시(${todayStartKst.toISOString()}) 이전 뉴스 데이터 삭제 시작...`);

    const { error } = await supabase
      .from('news_articles')
      .delete()
      .lt('collected_at', todayStartKst.toISOString());

    if (error) {
      console.error(`❌ 전날 데이터 삭제 실패: ${error.message}`);
    } else {
      console.log(`🗑️ 전날 데이터 삭제 완료`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ 전날 데이터 삭제 중 오류 발생: ${message}`);
  }
}

// ── 4) 스케줄러 등록 ─────────────────────────────────────────
export function startScheduler(): void {
  // 1시간 간격 정시 실행
  cron.schedule('0 * * * *', () => {
    runNewsJob().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`🔥 스케줄러 치명적 오류: ${message}`);
    });
  });

  // 매일 한국 시간 00:00에 전날 데이터 삭제 실행
  cron.schedule(
    '0 0 * * *',
    () => {
      cleanPreviousDaysArticles().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`🔥 일일 데이터 정리 스케줄러 오류: ${message}`);
      });
    },
    {
      timezone: 'Asia/Seoul',
    }
  );

  console.log('⏰ 뉴스 스케줄러 등록 완료 — 매 1시간 정시 실행 (매일 00:00 전날 데이터 자동 삭제)');

  // 서버 기동 시 즉시 1회 실행 (초기 데이터 확보)
  console.log('🚀 초기 수집 시작...');
  runNewsJob().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🔥 초기 수집 실패: ${message}`);
  });

  // 서버 기동 시 즉시 1회 정리 (기존 구데이터 정리)
  console.log('🧹 초기 데이터 정리 시작...');
  cleanPreviousDaysArticles().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🔥 초기 데이터 정리 실패: ${message}`);
  });
}
