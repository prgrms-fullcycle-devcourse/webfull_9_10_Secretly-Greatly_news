import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * URL에서 언론사 이름 및 본문 추출 (HTML 스크래핑)
 */
export async function scrapeArticleDetails(
  url: string,
): Promise<{ publisher: string | null; content: string | null }> {
  try {
    const res = await axios.get(url, {
      timeout: 3000,
      headers: {
        // 네이버/언론사 봇 차단 우회용 User-Agent
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const $ = cheerio.load(res.data);

    // 1) 언론사 이름 추출
    let publisher: string | null = null;
    const ogSiteName =
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="og:site_name"]').attr('content');
    if (ogSiteName) {
      publisher = ogSiteName.trim();
    } else {
      const ogAuthor = $('meta[property="og:article:author"]').attr('content');
      if (ogAuthor) {
        publisher = ogAuthor.split('|')[0].trim();
      }
    }

    // 도메인 주소로 나온 경우 실패 처리
    if (publisher && publisher.includes('.')) {
      publisher = null;
    }

    // 2) 기사 본문 추출 (네이버 뉴스 본문 셀렉터)
    // 불필요한 태그(스크립트, 스타일 등) 제거
    $('script, style, .b_comp_right').remove();
    let content =
      $('#dic_area').text() ||
      $('#articeBody').text() ||
      $('#newsct_article').text() ||
      $('.news_end_c').text();

    // 연속된 공백 및 줄바꿈 정리
    content = content.replace(/\s+/g, ' ').trim();

    return {
      publisher,
      content: content.length > 0 ? content : null,
    };
  } catch {
    // 타임아웃 또는 차단 시 실패 반환
    return { publisher: null, content: null };
  }
}
