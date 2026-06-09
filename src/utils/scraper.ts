import axios from 'axios';
import * as cheerio from 'cheerio';

// 본문으로 인정할 최소 길이 (이보다 짧으면 추출 실패로 간주)
const MIN_CONTENT_LENGTH = 150;

// 브라우저 위장용 User-Agent (봇 차단 우회)
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 본문 컨테이너로 자주 쓰이는 셀렉터 (네이버 + 주요 국내 언론사 + 범용)
const CONTENT_SELECTORS = [
  '#dic_area', // 네이버 뉴스(모바일/PC 신버전)
  '#articeBody',
  '#newsct_article',
  '.news_end_c',
  '#articleBodyContents', // 다음/구 네이버
  '#article-view-content-div', // 다수 지역/전문지 (CMS 공통)
  '#articleBody',
  '#newsContent',
  '.article_body',
  '.article-body',
  '.art_text',
  '.news_body',
  'article',
];

/** 본문에서 제거할 노이즈 텍스트 패턴 (기자 정보, 저작권 등) */
function cleanContent(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/무단[\s]*전재[\s-]*및[\s]*재배포[\s]*금지.*$/g, '')
    .replace(/Copyright.*$/gi, '')
    .trim();
}

/** 여러 후보 셀렉터를 순회하며 가장 그럴듯한 본문을 고른다. */
function extractContent($: cheerio.CheerioAPI): string | null {
  // 1) 알려진 본문 셀렉터 우선 시도 — 가장 긴 텍스트를 채택
  let best = '';
  for (const sel of CONTENT_SELECTORS) {
    $(sel).each((_, el) => {
      const text = cleanContent($(el).text());
      if (text.length > best.length) best = text;
    });
    if (best.length >= MIN_CONTENT_LENGTH) break;
  }
  if (best.length >= MIN_CONTENT_LENGTH) return best;

  // 2) 폴백: 모든 <p> 단락을 모아 본문 추정 (충분히 긴 단락만)
  const paragraphs: string[] = [];
  $('p').each((_, el) => {
    const text = cleanContent($(el).text());
    if (text.length >= 30) paragraphs.push(text);
  });
  const joined = cleanContent(paragraphs.join(' '));
  if (joined.length >= MIN_CONTENT_LENGTH) return joined;

  // 3) 최후 폴백: og:description / meta description (짧지만 없는 것보단 나음)
  const metaDesc =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content');
  const metaText = metaDesc ? cleanContent(metaDesc) : '';
  return metaText.length >= MIN_CONTENT_LENGTH ? metaText : null;
}

/** 언론사 이름을 여러 메타 태그에서 추출한다. */
function extractPublisher($: cheerio.CheerioAPI): string | null {
  const candidates = [
    $('meta[property="og:site_name"]').attr('content'),
    $('meta[name="og:site_name"]').attr('content'),
    $('meta[name="twitter:site"]').attr('content'),
    $('meta[property="og:article:author"]').attr('content')?.split('|')[0],
    $('meta[name="author"]').attr('content'),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const name = raw.trim();
    // 도메인 주소(점 포함)나 빈 값은 제외
    if (name && !name.includes('.') && name.length <= 40) {
      return name;
    }
  }
  return null;
}

/**
 * URL에서 언론사 이름 및 본문 추출 (HTML 스크래핑)
 */
export async function scrapeArticleDetails(
  url: string,
): Promise<{ publisher: string | null; content: string | null }> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 8000, // 3s → 8s 상향 (언론사 원문 응답 지연 대비)
      maxRedirects: 5,
      responseType: 'text',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      // 4xx/5xx여도 예외 대신 빈 본문 처리로 흘려보냄
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const $ = cheerio.load(res.data);

    // 본문 추출 전, 명백한 노이즈 영역 제거
    $(
      'script, style, noscript, iframe, header, footer, nav, aside, ' +
        '.b_comp_right, .ad, .advertisement, .reporter_area, .copyright, .promotion',
    ).remove();

    const publisher = extractPublisher($);
    const content = extractContent($);

    return { publisher, content };
  } catch {
    // 타임아웃 또는 차단 시 실패 반환
    return { publisher: null, content: null };
  }
}
