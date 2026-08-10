# HM SIGN — 작업 인계 문서

> 최종 갱신 2026-08-10
> **로컬 파일 없이 이 문서와 GitHub만으로 이어서 작업할 수 있도록** 정리했습니다.
> **[사실]** = 이 세션에서 직접 확인·검증 / **[미확인]** = 확인 수단이 없어 단정하지 않음
> 확인하지 않은 것을 사실로 적지 않습니다.

---

## 0. 운영 원칙 (2026-08-10 확정)

- **GitHub private repo = 유일한 영구 원본(source of truth)**
- **회사 PC에는 소스코드를 보관하지 않는다** — 로컬 clone 없이 브라우저만 사용
- 작업은 **Claude Code web** 등 원격 환경에서 GitHub를 직접 받아 진행
- secrets(.env / API key / service_role key / 토큰)는 **저장소에 절대 커밋하지 않는다**

---

## 1. 시스템 구성 [사실]

| 구성 | 주소 | 저장소 | 배포 |
|---|---|---|---|
| 홈페이지 | https://hm-sign-website.pages.dev | `dmswl1701/hminterior-official` | Cloudflare **Pages** — main push 시 자동 |
| ERP | https://hm-sign-erp.dmswl1701.workers.dev | `dmswl1701/HM-SIGN-ERP` | Cloudflare **Workers Builds** — main push 시 자동 |
| CMS API | https://hm-sign-website-cms.dmswl1701.workers.dev | `dmswl1701/hm-sign-website` ⚠ 아래 주의 | 대시보드 수동 편집 가능 |
| DB/Storage | `ndjxdwsvgoxzzrszsycj.supabase.co` | — | — |

### ⚠ 이전 인계문서의 오류 정정 [사실]
이전 HANDOFF에는 **"CMS Worker는 저장소 없음"** 이라고 적혀 있었으나 **틀렸습니다.**
CMS Worker 소스는 `dmswl1701/hm-sign-website` 저장소의 **`website-cms-worker.js`** 에 있습니다.
(단, 대시보드에서 직접 편집이 가능한 구조라 **저장소 = 배포본 보장은 없습니다.** 3절 참조)

### 저장소 3개 역할
- **`hminterior-official`** — 공개 홈페이지 정적 소스. `index.html` 외 6개 페이지 + `assets/{site.css,site.js,hero.jpg}` + `_headers` `_redirects` `robots.txt` `sitemap.xml`
- **`HM-SIGN-ERP`** — ERP 본체. `public/index.html` 단일 파일 + `wrangler.jsonc` + `package.json`
- **`hm-sign-website`** — CMS Worker 소스(`website-cms-worker.js`) + 초기 홈페이지 시안 다수(`index (1).html` 등 레거시). **현재 홈페이지 운영 소스가 아님.** 혼동 주의.

---

## 2. 저장소 최신 상태 [사실 — 2026-08-10 확인]

### `hminterior-official`
```
main                        6b87046  Add HANDOFF.md
design/visual-polish-2026   2f2556b  Load mobile v8 layout fixes on process page   ← 진행 중, main 미병합
```
- **디자인 작업은 `design/visual-polish-2026` 브랜치에만 있습니다. main에 병합하지 마세요.**
- 프리뷰: https://design-visual-polish-2026.hm-sign-website.pages.dev
- 그 외 `fix/portfolio-*`, `debug/*` 브랜치 다수 존재(과거 작업 잔재)

### `HM-SIGN-ERP`
```
main   d9cc19c  Add HANDOFF.md
```
- 배포본 `APP_BUILD = V43.0807.BATCH6`

### `hm-sign-website` (CMS Worker)
```
main                                  2ca77cc  Fix portfolio detail API and admin image previews
deploy/cms-worker-20260807            72fbb59
fix/portfolio-detail-worker-20260807  4ff0e68
noop/check-public-detail-20260807     35a873c
```

---

## 3. 사진 역할(role) — `progress` 지원 여부 ★중요

### 저장소 소스 [사실]
`hm-sign-website` 의 `website-cms-worker.js`, **4개 브랜치 전부 동일**:
```js
const allowedRoles = new Set(['cover', 'before', 'after', 'gallery']);
```
→ **`progress` 는 저장소 소스에 없습니다.** (`deploy/cms-worker-20260807` 브랜치 포함)

### 실제 배포된 Worker [미확인]
확인 수단이 없습니다. 근거:
- Worker는 Cloudflare 대시보드에서 직접 편집 가능 → 저장소와 배포본이 다를 수 있음
- 외부에서 API로 확인 불가: 관리자 라우트는 **role 검증보다 인증이 먼저** 걸림
  ```
  PATCH .../assets/{id}  role=progress       → 401 unauthorized
  PATCH .../assets/{id}  role=before         → 401 unauthorized
  PATCH .../assets/{id}  role=nonsense_role  → 401 unauthorized   (세 응답이 완전히 동일)
  ```
- **401은 "경로/값이 유효하다"는 증거가 아닙니다.**

**확인 방법(30초):** Cloudflare 대시보드 → Workers & Pages → `hm-sign-website-cms`
→ 코드 편집 → `allowedRoles` 검색. 이것이 유일한 ground truth입니다.

### ERP 클라이언트 [사실]
현재 `HM-SIGN-ERP/public/index.html` 전수 조사:

| role 값 | 등장 횟수 |
|---|---|
| `'cover'` | 16 |
| `'gallery'` | 14 |
| `'before'` / `'after'` / `'progress'` / `'during'` | **0** |

- 자동 배정 로직 전체: `autoRole = hasCover ? 'gallery' : 'cover'`
- `cmsAssetRole()` 호출부도 `'cover'` 하나뿐
- (`'process'` 2회는 CMS 콘텐츠 키 목록이며 사진 role과 무관)

→ **Worker가 무엇을 허용하든, 현재 ERP에는 `before`/`after`/`progress` 를 붙일 수단이 없습니다.**

### 홈페이지 [사실]
`hminterior-official/assets/site.js` 의 `ROLE_LABEL` / `groupByRole()`:
```
before → '시공 전'   progress/during/process → '제작·시공 과정'
after  → '시공 후'   cover → '대표 사진'      gallery → '현장 사진'
```
- 표 기반이라 **Worker에 role이 추가되면 홈페이지는 코드 수정 없이 자동 반영**
- 모르는 role이 와도 '현장 사진'으로 안전 수용

### 결론 [사실]
`design/visual-polish-2026` 에 구현된 **'시공 전 · 시공 후' 비교 블록은 현재 운영 데이터로는 표시되지 않습니다.**
공개된 포트폴리오 1건의 사진 1장이 `role: "cover"` 뿐이기 때문입니다.
코드는 정상이며 **데이터를 기다리는 상태**입니다. 활성화하려면 순서대로:
1. Worker `allowedRoles` 에 `progress` 포함 여부 확인/추가
2. **ERP에 role 배정 UI 추가** (현재 완전히 없음 — 이게 실제 병목)

---

## 4. CMS API [사실]

### 공개 (인증 불필요, Origin 제한)
```
GET /api/v1/public/site
GET /api/v1/public/portfolio?pageSize=24&page=1
GET /api/v1/public/portfolio/{slug}      ← slug 로만 조회. id 는 404
```
`images[]`: `role, sort_order, image_url, thumbnail_url, ...` — 이미지 URL은 **만료되는 서명 URL**

### 관리자 (Bearer JWT + Origin 필수)
```
GET/PATCH  /api/v1/cms/inquiries[/{uuid}]
GET/PUT    /api/v1/cms/content/{key}          status: draft|review|published
PUT/DELETE /api/v1/cms/portfolios/{uuid}
GET/POST   /api/v1/cms/portfolios/{uuid}/assets
PATCH      /api/v1/cms/portfolios/{uuid}/assets/{assetId}
```
> ⚠ 경로는 `/cms` 입니다. `/admin` 이 아닙니다.

### Origin 규칙 [사실 — 2026-08-10 재확인]
| Origin | 결과 |
|---|---|
| `https://hm-sign-erp.dmswl1701.workers.dev` | 관리자 라우트 허용 |
| `https://hm-sign-website.pages.dev` | 공개 라우트 허용 |
| **Pages 프리뷰 도메인** (`design-*.hm-sign-website.pages.dev`) | **차단** — `PUBLIC_ORIGIN` 불일치 |
| `localhost` / `file://` | 차단 |

→ **프리뷰 배포에서는 시공사례 실데이터가 안 나옵니다.** 정적 fallback이 대신 표시됩니다.
디자인·레이아웃 확인용으로는 문제없습니다.

### 인증 [사실]
`ADMIN_TOKEN` 없음. Supabase 이메일 로그인 → JWT → Worker가 `ADMIN_EMAILS` 대조.
무료 플랜이라 메일 템플릿 수정 불가(매직 링크만) + 시간당 발송 한도 → ERP는 **비밀번호 로그인이 기본**.

### Worker 환경변수 이름 [사실 — 값은 대시보드에만 존재]
```
ADMIN_EMAILS / ALLOWED_ORIGIN / ERP_ORIGIN / PUBLIC_ORIGIN
SUPABASE_URL / SUPABASE_SECRET_KEY(Secret)
```
**값은 저장소에 없으며 절대 커밋하지 않습니다.**

---

## 5. 홈페이지 디자인 작업 (`design/visual-polish-2026`) [사실]

### 배경
`8e8b3ee` 리뉴얼 이후 커밋들이 **오버라이드 레이어를 덧쌓는 방식**으로 누적되어,
`site.css` 안에서 같은 선택자가 최대 8회까지 재정의되고 있었습니다. 이것이
화면이 덜 다듬어져 보이던 실제 원인이었습니다(기능 문제 아님).

### 반영된 변경
- CSS를 **토큰 기반 단일 시스템**으로 재정리. 선택자 111개 전부 보존(자동 검사).
- 제목 굵기 상한 600(기존 750~850), 자간 -.022em 이내
- 위계 역전 수정: 푸터 문구 42px > 섹션 제목 31.7px 이던 것을 동일 스케일로
- Hero 본문 14.7px → 16px
- **한글 measure `ch` → `em`**: `ch`는 한글 글자폭을 절반으로 과소평가해
  모바일 Hero가 의도한 3줄이 아니라 4줄로 깨지고 있었음 (390/360px에서 3줄 복구 확인)
- 포트폴리오: 사진 위 딤 제거, 캡션을 사진 아래로. 사례 1~3건일 때 열 수 고정
- 상세 갤러리 `columns` → `grid` (사진이 DOM 순서대로 읽히도록)
- **시공 전 · 시공 후 비교 블록** 추가 (3절 참조 — 현재 데이터로는 미표시)
- 스크롤 리빌: IntersectionObserver, 14px/.6s/1회, `prefers-reduced-motion` 대응,
  **관찰 실패 시 2.6초 뒤 무조건 표시하는 안전장치** (콘텐츠 실종 방지)
- 모바일 폼 입력 16px (iOS 포커스 확대 방지), 제출 버튼 전폭
- 이후 다른 세션이 `polish-v5.css` 등 모바일 v8 레이아웃 보정을 추가 (`2f2556b`)

### 검증 [사실]
실제 브라우저 360/390/834/1440/1920px × 7페이지 — 가로 스크롤 0, 콘솔 에러 0.
필터·더보기(24→30)·상세 4가지 role 조합·라이트박스(키보드/스와이프/ESC)·문의 폼 제출 성공 확인.
CMS 미연결 시 정적 fallback 표시 확인.
**픽셀 단위 시각 검수는 미완료** — 대표 확인 대기 중.

### 참고한 레퍼런스 (makesign.kr) [사실 — 실측]
| | makesign.kr | HM SIGN 현재 |
|---|---|---|
| Hero 제목 | 41.5px / **700** / -0.05em | 49px / 600 / -0.024em |
| Hero 본문 | **13px** | 16px |
- 레퍼런스가 오히려 **더 굵고 더 조인** 타이포임. 대표 지시("가볍고 균형있게")와 반대 방향이라
  숫자를 따르지 않고 지시를 따랐습니다.
- 가져올 만한 것: **Before/After 드래그 슬라이더** (레퍼런스는 히어로에 배치). 미구현.

---

## 6. 로컬 파일 상태 [사실 — 2026-08-10]

회사 PC에는 더 이상 소스를 두지 않는 방침입니다. 확인된 상태:

2026-08-10 대표가 로컬 HM SIGN 파일을 전부 삭제했습니다. 삭제 시점 기준 정리:

| 항목 | 상태 |
|---|---|
| `CLAUDE.md` (프로젝트 가이드) | ✅ **복원 완료** — 이 저장소 루트에 push됨 |
| `HANDOFF.md` | ✅ 이 문서 |
| ERP `index.html` | ✅ 손실 없음 — 로컬본(`V43.0807.0835`)이 GitHub본(`V43.0807.BATCH6`)보다 **오래된 버전**이었음 |
| 홈페이지 소스 전체 | ✅ 손실 없음 — `hminterior-official` 과 바이트 단위 동일함을 확인 후 삭제 |
| `docs/*.md` | ⚠ **미백업 상태로 삭제됨** (`AI_COMPANY_OS` `API` `DATABASE` `ROADMAP` `CHANGELOG` `PROJECT`, `reports/`) |
| `.claude/agents/*.md` | ⚠ **미백업 상태로 삭제됨** (7개 AI 직원 정의) |
| `.claude/settings.json` | ⚠ 미백업 상태로 삭제됨 (권한 설정. secret 없음) |

**복구 경로:** OneDrive 온라인 휴지통(기본 30일 보관)
→ onedrive.com → 휴지통 → `바탕 화면/hm` 항목 복원.
복원되면 위 ⚠ 항목들을 이 저장소에 push해 두는 것을 권장합니다.
(단, 이 문서 3~5절에 핵심 내용은 이미 요약되어 있어 작업 재개 자체는 가능합니다.)

---

## 7. 다음 작업자를 위한 시작 절차

```bash
# 홈페이지 디자인 이어서 작업
git clone https://github.com/dmswl1701/hminterior-official.git
cd hminterior-official
git checkout design/visual-polish-2026     # main 에 병합하지 말 것

# ERP
git clone https://github.com/dmswl1701/HM-SIGN-ERP.git

# CMS Worker
git clone https://github.com/dmswl1701/hm-sign-website.git   # website-cms-worker.js
```

로컬 미리보기는 빌드 없이 정적 파일을 그대로 서빙하면 됩니다.
단 **localhost는 CMS Worker가 CORS로 차단**하므로 시공사례 실데이터는 보이지 않습니다.

### 절대 원칙
1. 기존 기능 삭제 금지 — 새 기능은 추가만
2. 기존 UI/색상/브랜드 유지 — 네이비 + 웜 앰버, HM·SIGN 워드마크, 사옥 hero 사진
3. Supabase 구조 변경 금지 (추가만)
4. 빌드 스텝·번들러 도입 금지
5. 배포 = main push 자동 배포. 다른 방식으로 배포하지 말 것
6. secrets 커밋 금지

---

# 2026-08-10 추가 인계 (홈페이지 리뉴얼 · ERP 연동)

## 이전 문서의 오류 정정 [사실]
1. **"CMS Worker 저장소 없음" → 틀림.** 소스는 `dmswl1701/hm-sign-website` 의
   `website-cms-worker.js` 에 있다. 단 **배포 경로는 아니다**(대시보드 직접 편집).
2. **배포본 ≠ 저장소** — 2026-08-10 확인. 저장소는 1번 줄이 `API_BUILD`, 배포본은 `json`.
   `allowedRoles` 도 저장소엔 `progress` 없고 배포본엔 있다.
   → **저장소를 읽고 배포본을 단정하지 말 것.**
3. **섹션 추가/순서변경에 Supabase 테이블 추가 필요 → 틀림.**
   `pages` 콘텐츠 키 하나에 중첩 JSON 으로 처리 가능하다.

## 이번에 배포된 것 [사실]
### 홈페이지 (`hminterior-official` main)
- CSS **6개 파일 → `site.css` 1개로 통합**. 7페이지 모두 한 파일만 로드.
  (이전엔 회사소개·프로세스 5겹 / 홈 4겹 / 시공사례 2겹 / 나머지 1겹이라
   같은 위계 제목이 페이지마다 다르게 보였다. `desktop-v6.css` 는 고아 파일이라 제거)
- 제목 스케일·굵기·자간을 `site.css` 한 곳에서만 정의
  (`--fs-display/h1/h2/h3`). 1440에서 52/42/36/20.9, 390에서 29/25/22/17.
- 한글 measure `ch` → `em` (ch 는 한글 폭을 절반으로 과소평가해 모바일 Hero 가 4줄로 깨졌다)
- Hero 문구 위치 수정 — `desktop-v7` 의 `left` 가 `position:absolute` 전제라
  relative 로 바뀐 뒤 문구가 화면 중앙까지 밀렸다
- 포트폴리오 그리드(사진 위 딤 제거, 캡션 아래로), 강점 도형 섹션, 스크롤 리빌
- **브랜드 인트로** — 도면선 → 점등 → 사옥 사진. 4.15s / 모바일 2.99s,
  세션당 1회(`sessionStorage`), `?intro=1` 강제, SKIP·ESC, reduced-motion 시 미재생
- **시공 전/후 드래그 비교** — `before`/`after` 가 둘 다 있을 때만 생성.
  없으면 컨테이너가 hidden 인 채로 아무것도 그리지 않는다
- **문구 편집 기반** — `data-cms="pages.어디.무엇"` 태그가 CMS `pages` 값으로 교체된다.
  값이 비면 HTML 원문 유지. 현재 홈 제목 4개 + 강점 3개에 적용

### ERP (`HM-SIGN-ERP` main)
- **사진 역할 버튼** — 사진 카드 아래 `대표 / 시공 전 / 시공 후 / 현장`
  (기존 `cmsQueueSetRole` 은 정의만 있고 호출부가 0곳이었다)
- **문구 편집 탭** — 홈페이지 관리 → `문구 편집`
- 저장 로직 보완: discovery 는 서버에 있는 키만 잡아(404 제외) 새 키 `pages` 가
  영영 저장되지 않았다. 편집값이 있으면 후보 키를 함께 PUT 하도록 수정
- `applyCms` 의 프로세스 설명 버그 수정 — desc 를 항상 빈 값으로 두어
  CMS 에 단계를 넣는 순간 화면 설명이 통째로 사라졌다

## 검증 못 한 것 [사실 — 정직하게]
- **문구 편집 저장 / 사진 역할 버튼을 실제로 눌러보지 못했다.** 로그인이 필요하다.
  성공 시 "홈페이지에 반영했어요" 토스트. 400 이면 Worker `contentKeys` 에 `pages` 누락.
- **애니메이션 실제 움직임을 한 번도 못 봤다.** 작업 환경 브라우저가 프레임을 그리지 않아
  타이밍 계산값과 최종 상태만 검증했다.

## 데이터 현실 [사실]
공개 시공사례 **0건**. 시공사례 페이지는 정적 안내 2줄만 뜬다.
`before`/`after` 사진이 둘 다 있는 사례가 생겨야 드래그 비교가 나타난다.

## 이미 되어 있는 것 (새로 만들지 말 것) [사실]
- 사진 **자동 리사이즈**: 원본 + 2000px WebP(q84) + 640px 썸네일(q78) 자동 생성
- **여러 장 한번에 업로드**: 대기열 + 자동 업로드 + 진행률 + 실패분 재시도

## 다음 할 일
1. 회사소개·프로세스·사인종류 페이지 문구에 `data-cms="pages.*"` 태그 달기 (기반 완료, 태그만)
2. 섹션 켜기/끄기 + 순서 바꾸기 — `pages` 키 안에서 처리, 스키마 변경 불필요
3. 블록 추가/삭제

## 절대 원칙 (추가)
- **홈페이지 CSS 는 `site.css` 한 파일에서만 고친다.** 오버라이드 파일을 새로 만들면
  위에 적힌 종류의 버그가 반드시 다시 생긴다.
- 홈페이지는 아직 `noindex,nofollow`. 정식 오픈 시 해제할 것.
