import axios from "axios";
import { env } from "../config/env.js";
import type { NaverNewsResponse, NaverNewsItem } from "../interfaces/news.interface.js";

/**
 * 네이버 뉴스 검색 API 호출
 */
export async function fetchNaverNews(keyword: string): Promise<NaverNewsItem[]> {
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
