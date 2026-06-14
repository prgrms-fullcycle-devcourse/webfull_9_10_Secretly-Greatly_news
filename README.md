# News Summary Worker (뉴스 수집 및 요약 서비스)

이 프로젝트는 Naver 뉴스 검색 API를 통해 최신 뉴스를 수집하고, 로컬 문장 중요도 분석 알고리즘을 사용해 본문을 3줄로 요약한 후 Supabase 데이터베이스에 적재하는 백그라운드 워커 서비스이자 서빙 API 서버입니다.

---

## 🛠️ 주요 기능

1. **주기적 스크래핑 & 수집 Scheduler**
   - `node-cron`을 활용하여 **매 시간 정각**마다 설정된 검색 키워드로 최신 네이버 뉴스 정보를 탐색 및 수집합니다.
   - 서버 시작 시 데이터 공백을 방지하기 위해 **즉시 1회 초기 수집**을 실행합니다.

2. **뉴스 본문 추출 및 로컬 3줄 요약**
   - 검색된 기사 링크를 통해 직접 뉴스 본문 HTML 데이터를 스크래핑합니다.
   - 단어 빈도수(TF-IDF 가중치 개념)와 문장 순서(두괄식 가중치)를 결합한 알고리즘을 로컬에서 작동시켜 핵심 내용 **3줄 요약**을 자동으로 수행합니다. (외부 AI API 없이 100% 오프라인 작동)

3. **데이터베이스 적재 및 자동 로테이션 (Rotation)**
   - 수집이 완료된 기사를 Supabase DB (`news_articles` 테이블)에 대량 저장(Bulk Insert)합니다.
   - 데이터베이스 용량 최적화를 위해 키워드별 보존 건수(`MAX_RECORDS_KEEP`)를 넘는 오래된 기사는 수집 완료 시점에 자동으로 삭제합니다.

4. **서빙용 Express API**
   - 프론트엔드 등의 클라이언트 애플리케이션에서 수집된 요약 데이터를 필터링 및 페이징하여 신속하게 읽어갈 수 있도록 엔드포인트를 열어둡니다.

---

## ⚙️ 기술 스택

- **Runtime & Language**: Node.js (v22+), TypeScript (v5+)
- **Server Framework**: Express.js
- **Execution Tool**: `tsx` (TypeScript Execute tool)
- **Scraping**: Axios, Cheerio (본문 및 언론사 사이트 메타태그 파싱)
- **Database**: Supabase Client (`@supabase/supabase-js`)
- **Scheduling**: `node-cron`

---

## 🚀 시작하기

### 1. 의존성 패키지 설치

이 프로젝트는 `pnpm`을 기본 패키지 매니저로 사용합니다.

```bash
pnpm install
```

### 2. 환경 변수 설정

`news` 폴더 루트에 `.env.local` 파일을 생성하고, `.env.sample` 내용을 참고하여 API 키 정보를 입력해 주세요.

```bash
cp .env.sample .env.local
```

**주요 환경 변수 설명:**

- `PORT`: Express API 서버가 실행될 포트 번호 (기본: `4333`)
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`: Supabase 프로젝트 주소와 `service_role` 비밀 키 (DELETE/INSERT 등 어드민 권한 처리에 필요)
- `NAVER_CLIENT_ID` & `NAVER_CLIENT_SECRET`: 네이버 오픈 API 검색 서비스 클라이언트 자격증명
- `SEARCH_KEYWORDS`: 뉴스 수집을 지속해서 수행할 검색어 목록 (콤마 분할)
- `NEWS_DISPLAY_COUNT`: 1회 수집 시도 당 네이버 검색 API에서 불러올 뉴스 건수 (최대 100)
- `MAX_RECORDS_KEEP`: 키워드별 보존할 최대 기사 레코드 수 (이를 초과하면 오래된 것부터 순차 삭제)

### 3. Supabase 테이블 생성

데이터 적재를 시작하기 전에 Supabase의 **SQL Editor**에 접속하여 `supabase_ddl.sql` 쿼리를 실행해 주세요.
이 쿼리는 테이블 생성, 성능 최적화용 인덱스 지정 및 익명 사용자(SELECT 전용 RLS) 정책 설정을 일괄 실행합니다.

---

## 🏃 실행 명령어

- **개발 모드 실행 (Hot-reload)**:
  ```bash
  pnpm run dev
  ```
- **빌드 및 타입 체크 (TypeScript compile)**:
  ```bash
  pnpm run build
  ```
- **프로덕션 모드 시작**:
  ```bash
  pnpm start
  ```

---

## 🌐 API 엔드포인트 규격

### 1. Health Check

서버 및 워커의 작동 여부와 Uptime 정보를 확인합니다.

- **Method**: `GET`
- **URL**: `/health`
- **Response 예시**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-06-07T02:20:00.000Z",
    "uptime": 124.58
  }
  ```

### 2. 최신 뉴스 목록 조회

가장 최근에 수집되어 적재된 뉴스 기사 목록을 조회합니다.

- **Method**: `GET`
- **URL**: `/api/news/latest`
- **Query Parameters (선택)**:
  - `keyword` (string): 특정 수집 키워드로만 필터링 (예: `국내증시`, `해외증시` 등)
  - `limit` (number): 가져올 기사 수 한도 (기본: `40`, 최대 `100`)
- **Response 예시**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 105,
        "keyword": "주식",
        "title": "금리 인하 기대로 코스피 상승 마감...",
        "link": "https://n.news.naver.com/mnews/article/...",
        "description": "뉴스 본문 내용 전문 혹은 설명 요약...",
        "pub_date": "Sun, 07 Jun 2026 10:15:00 +0900",
        "source": "한국경제",
        "summary": "• 첫 번째 요약 문장입니다.\n• 두 번째 요약 문장입니다.\n• 세 번째 요약 문장입니다.",
        "collected_at": "2026-06-07T01:15:05.123Z"
      }
    ],
    "count": 1,
    "fetchedAt": "2026-06-07T02:21:00.000Z"
  }
  ```
