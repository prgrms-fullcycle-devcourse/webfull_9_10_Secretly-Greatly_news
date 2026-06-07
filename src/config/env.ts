// ─────────────────────────────────────────────────────────────
// 환경변수 로드 및 검증
// ─────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import type { EnvConfig } from "../interfaces/news.interface.js";

dotenv.config({ path: ".env.local" });

/**
 * 필수 환경변수를 읽고 누락 시 즉시 프로세스를 종료한다.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ 필수 환경변수 ${key}가 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

/**
 * 숫자형 환경변수를 읽고 기본값을 적용한다.
 */
function requireNumericEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`❌ 환경변수 ${key}의 값 "${raw}"은(는) 유효한 숫자가 아닙니다.`);
  }
  return parsed;
}

/** 검증이 완료된 환경변수 객체 */
export const env: EnvConfig = {
  PORT: requireNumericEnv("PORT", 3000),
  SUPABASE_URL: requireEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  NAVER_CLIENT_ID: requireEnv("NAVER_CLIENT_ID"),
  NAVER_CLIENT_SECRET: requireEnv("NAVER_CLIENT_SECRET"),
  SEARCH_KEYWORDS: (process.env["SEARCH_KEYWORDS"] ?? "주식,코인,암호화폐,경제")
    .split(",")
    .map((s) => s.trim()),
  NEWS_DISPLAY_COUNT: requireNumericEnv("NEWS_DISPLAY_COUNT", 10),
  MAX_RECORDS_KEEP: requireNumericEnv("MAX_RECORDS_KEEP", 10),
};
