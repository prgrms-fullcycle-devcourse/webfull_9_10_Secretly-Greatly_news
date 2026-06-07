// ─────────────────────────────────────────────────────────────
// 뉴스 스케줄러: 수집 → 적재 → 로테이션
// ─────────────────────────────────────────────────────────────

import cron from "node-cron";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import type {
  NaverNewsResponse,
  NaverNewsItem,
  NewsArticleInsert,
  ArticleCategory,
} from "../interfaces/news.interface.js";

// ── HTML 태그 제거 유틸 ──────────────────────────────────────
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&[a-zA-Z]+;/g, " ").trim();
}

// ── URL에서 언론사 이름 및 본문 추출 (HTML 스크래핑) ───────────────────
async function scrapeArticleDetails(url: string): Promise<{ publisher: string | null; content: string | null }> {
  try {
    const res = await axios.get(url, {
      timeout: 3000,
      headers: {
        // 네이버/언론사 봇 차단 우회용 User-Agent
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    
    const $ = cheerio.load(res.data);
    
    // 1) 언론사 이름 추출
    let publisher: string | null = null;
    const ogSiteName = $('meta[property="og:site_name"]').attr("content") || $('meta[name="og:site_name"]').attr("content");
    if (ogSiteName) {
      publisher = ogSiteName.trim();
    } else {
      const ogAuthor = $('meta[property="og:article:author"]').attr("content");
      if (ogAuthor) {
        publisher = ogAuthor.split("|")[0].trim();
      }
    }
    
    // 도메인 주소로 나온 경우 실패 처리
    if (publisher && publisher.includes(".")) {
      publisher = null;
    }

    // 2) 기사 본문 추출 (네이버 뉴스 본문 셀렉터)
    // 불필요한 태그(스크립트, 스타일 등) 제거
    $('script, style, .b_comp_right').remove();
    let content = $('#dic_area').text() || $('#articeBody').text() || $('#newsct_article').text() || $('.news_end_c').text();
    
    // 연속된 공백 및 줄바꿈 정리
    content = content.replace(/\s+/g, ' ').trim();
    
    return { 
      publisher, 
      content: content.length > 0 ? content : null 
    };
  } catch {
    // 타임아웃 또는 차단 시 실패 반환
    return { publisher: null, content: null };
  }
}

// ── AI 요약 및 키워드 추출 (Gemini) ─────────────────────────
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateSummaryAndKeywords(content: string): Promise<{ summary: string; keywords: string[] } | null> {
  try {
    const prompt = `다음 뉴스 기사 본문을 읽고, 핵심 내용을 3줄로 요약하고, 가장 중요한 핵심 키워드 3~5개를 추출해줘.
반드시 아래 JSON 형식으로만 응답해. 백틱이나 마크다운 없이 순수 JSON만 반환해야 해.
{
  "summary": "1. 첫번째 요약\\n2. 두번째 요약\\n3. 세번째 요약",
  "keywords": ["키워드1", "키워드2", "키워드3"]
}

[기사 본문]
${content.substring(0, 3000)}`; // 너무 길면 짤라서 토큰 절약

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const text = response.text;
    if (!text) return null;
    
    try {
      const parsed = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
      if (parsed.summary && parsed.keywords) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`    ❌ AI 요약 실패: ${message}`);
    return null;
  }
}

// ── 키워드 → 카테고리 매핑 ───────────────────────────────────
function mapCategory(keyword: string): ArticleCategory {
  const lower = keyword.toLowerCase();
  if (lower.includes("주식") || lower.includes("stock")) return "stock";
  if (lower.includes("코인") || lower.includes("coin")) return "coin";
  if (lower.includes("암호화폐") || lower.includes("crypto")) return "crypto";
  if (lower.includes("경제") || lower.includes("economy")) return "economy";
  return "general";
}

// ── 1) 네이버 뉴스 검색 API 호출 ─────────────────────────────
async function fetchNaverNews(keyword: string): Promise<NaverNewsItem[]> {
  const response = await axios.get<NaverNewsResponse>(
    "https://openapi.naver.com/v1/search/news.json",
    {
      params: {
        query: keyword,
        display: env.NEWS_DISPLAY_COUNT,
        start: 1,
        sort: "date",
      },
      headers: {
        "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
      },
    },
  );

  return response.data.items;
}

// ── 2) Supabase 다건 INSERT ──────────────────────────────────
async function saveArticles(articles: NewsArticleInsert[]): Promise<void> {
  const { error } = await supabase
    .from("news_articles")
    .insert(articles);

  if (error) {
    throw new Error(`Supabase INSERT 실패: ${error.message}`);
  }
}

// ── 3) 로테이션: 각 키워드별로 최근 N개만 유지 ─────────────────────────────
async function rotateOldRecords(): Promise<void> {
  for (const keyword of env.SEARCH_KEYWORDS) {
    const { data: recentRows, error: selectError } = await supabase
      .from("news_articles")
      .select("id")
      .eq("keyword", keyword)
      .order("collected_at", { ascending: false })
      .limit(env.MAX_RECORDS_KEEP);

    if (selectError) {
      console.error(`로테이션 SELECT 실패 (${keyword}): ${selectError.message}`);
      continue;
    }

    if (!recentRows || recentRows.length === 0) {
      continue;
    }

    const keepIds = recentRows.map((row: { id: number }) => row.id);

    const { error: deleteError } = await supabase
      .from("news_articles")
      .delete()
      .eq("keyword", keyword)
      .not("id", "in", `(${keepIds.join(",")})`);

    if (deleteError) {
      console.error(`로테이션 DELETE 실패 (${keyword}): ${deleteError.message}`);
    }
  }

  console.log(`🗑️  로테이션 완료 — 각 키워드별 최근 ${env.MAX_RECORDS_KEEP}건 유지`);
}

// ── 4) 메인 Job: 키워드별 수집 → 적재 ────────────────────────
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

      // 2) HTML 정제 + 스크래핑 및 AI 요약 (Rate Limit 우회를 위해 순차 처리)
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

        let ai_summary = null;
        let ai_keywords = null;

        if (content) {
          console.log(`    🤖 AI 요약 중: ${stripHtmlTags(item.title).substring(0, 20)}...`);
          const aiResult = await generateSummaryAndKeywords(content);
          if (aiResult) {
            ai_summary = aiResult.summary;
            ai_keywords = aiResult.keywords;
          }
          // ⚠️ 무료 티어 Rate Limit 방어 (분당 15회 -> 약 4초 대기)
          await delay(4000);
        }
        
        const finalLink = item.originallink || item.link;
        // 본문을 긁어왔으면 본문 사용, 실패했으면 API 제공 짧은 description 사용
        const finalDescription = content ? content : stripHtmlTags(item.description);
        
        rawMapped.push({
          keyword,
          title: stripHtmlTags(item.title),
          link: finalLink,
          description: finalDescription,
          pub_date: item.pubDate,
          source: publisher,
          category,
          ai_summary,
          ai_keywords,
        });
      }

      // null로 매핑된 기사 필터링
      const articles: NewsArticleInsert[] = rawMapped.filter((a): a is NewsArticleInsert => a !== null);

      if (articles.length === 0) {
        console.log(`  ⚠️  "${keyword}" 유효한 기사(언론사명 추출 성공)가 없어 건너뜀`);
        continue;
      }

      // 3) Supabase 다건 INSERT
      await saveArticles(articles);
      console.log(`  ✅ "${keyword}" 적재 완료 (${articles.length}건 유효)`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ "${keyword}" 처리 실패: ${message}`);
    }
  }

  // 4) 로테이션
  try {
    await rotateOldRecords();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ 로테이션 실패: ${message}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`📰 뉴스 수집 작업 완료 (${elapsed}s)\n`);
}

// ── 5) 스케줄러 등록 ─────────────────────────────────────────
export function startScheduler(): void {
  cron.schedule("0 */1 * * *", () => {
    runNewsJob().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`🔥 스케줄러 치명적 오류: ${message}`);
    });
  });

  console.log("⏰ 뉴스 스케줄러 등록 완료 — 매 1시간 정시 실행");

  // 서버 기동 시 즉시 1회 실행 (초기 데이터 확보)
  console.log("🚀 초기 수집 시작...");
  runNewsJob().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🔥 초기 수집 실패: ${message}`);
  });
}
