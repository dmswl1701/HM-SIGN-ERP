# HM SIGN — 작업 인계 문서

> 작성 2026-08-07 · 이 문서 하나만 읽고 바로 이어서 작업할 수 있도록 정리했습니다.
> **[사실]** = 실제 확인·검증한 내용 / **[계획]** = 아직 구현하지 않은 내용
> 구현하지 않은 것을 완료로 쓰지 않았습니다.

---

## 1. 시스템 구성 [사실]

| 구성 | 주소 | 저장소 | 배포 방식 |
|---|---|---|---|
| 홈페이지 | https://hm-sign-website.pages.dev | `dmswl1701/hminterior-official` | Cloudflare **Pages** — main push 시 자동 (~40초) |
| ERP | https://hm-sign-erp.dmswl1701.workers.dev | `dmswl1701/HM-SIGN-ERP` | Cloudflare **Workers Builds** — main push 시 자동 (~60초) |
| CMS API | https://hm-sign-website-cms.dmswl1701.workers.dev | **저장소 없음** (대시보드에서 직접 편집) | 수동 |
| DB/Storage | `ndjxdwsvgoxzzrszsycj.supabase.co` | — | — |

### 각 구성의 역할
- **홈페이지** — 정적 사이트. CMS API에서 콘텐츠·시공사례를 읽어 표시만 함. 쓰기 없음.
- **CMS Worker** — 유일한 쓰기 통로. Supabase service key를 쥐고 있음. 인증·권한·이미지 최적화 담당.
- **ERP** — 단일 `public/index.html`. 견적·거래처·수금·작업 + AI 회사 + 홈페이지 관리.
- **Supabase** — `hm_data`(ERP 동기화), `website_site_content`, `website_portfolios`, `website_media`, `website_inquiries` / Storage 버킷 `portfolio`.

### Cloudflare Worker 환경변수 (CMS) [사실]
```
ADMIN_EMAILS=dmswl1701@gmail.com
ALLOWED_ORIGIN=https://hm-sign-erp.dmswl1701.workers.dev
ERP_ORIGIN=https://hm-sign-erp.dmswl1701.workers.dev
PUBLIC_ORIGIN=https://hm-sign-website.pages.dev
SUPABASE_URL=https://ndjxdwsvgoxzzrszsycj.supabase.co
SUPABASE_SECRET_KEY=(Secret)
```

---

## 2. 저장소 최신 상태 [사실]

### 홈페이지 `hminterior-official` — main `520a16d`
```
520a16d Scale portfolio card size to item count
9dd560e Portfolio grid: photo density and hover-revealed info
21828f0 Fix hero line count on small screens
6e161bd Design QA: typography scale, weights, spacing
8a7a608 Portfolio: role-based stages and scalable listing
f7ffcb6 Restore original HM SIGN logo mark   ← 로고 복구
8e8b3ee Refresh HM SIGN site with portfolio-first editorial design  ← 리뉴얼
d1e5de0 Make portfolio photos clickable      ← 리뉴얼 직전 기준점
```
구성: `index.html` `about` `works` `services` `process` `contact` `privacy` + `assets/{site.css,site.js,hero.jpg}` + `_headers` `_redirects` `robots.txt` `sitemap.xml`

### ERP `HM-SIGN-ERP` — main `cf8a935`
```
cf8a935 Normalize portfolio slugs for reliable detail pages
592070d Improve portfolio upload review workflow for staff
86e5d2b Simplify portfolio admin to auto-upload workflow
f14d72c Fix portfolio publishing from website admin
4454fd7 Rebuild portfolio upload as project-first batch workflow
...
```
⚠️ **`38f7bc3` 이후 약 20개 커밋은 ChatGPT가 작업한 것입니다.** 이 세션에서 검증하지 않았습니다.
구성: `public/index.html`(단일 파일) + `wrangler.jsonc` + `package.json`

**배포 상태**: 홈페이지·ERP 모두 저장소와 배포본 일치 확인. ERP `APP_BUILD = V43.0807.BATCH6`.

---

## 3. CMS API [사실 — Worker 소스 직접 확인]

### 공개 (인증 불필요, Origin 제한)
```
GET /api/v1/public/site
    → {company, banner, services, process, contact, seo, featuredProjects}
GET /api/v1/public/portfolio?pageSize=24&page=1
    → {items[], categories[], page, pageSize, total, pages}
GET /api/v1/public/portfolio/{slug}
    → {id,title,slug,industry,region,summary,materials,featured,status,
       created_at,updated_at,category,images:[...]}
```
- **상세는 slug 로만 조회됩니다. id 로는 404.**
- `images[]` 필드: `id, portfolio_id, original_path, optimized_path, thumbnail_path, role, sort_order, image_url, thumbnail_url`
- 이미지 URL은 **서명 URL**(만료 있음). Worker가 요청마다 새로 생성.

### 관리자 (Bearer JWT + Origin 필수)
```
GET   /api/v1/cms/inquiries              → {inquiries:[...]}
PATCH /api/v1/cms/inquiries/{uuid}
GET   /api/v1/cms/content/{key}
PUT   /api/v1/cms/content/{key}          status: draft|review|published
PUT   /api/v1/cms/portfolios/{uuid}
DELETE/api/v1/cms/portfolios/{uuid}
GET   /api/v1/cms/portfolios/{uuid}/assets
POST  /api/v1/cms/portfolios/{uuid}/assets
PATCH /api/v1/cms/portfolios/{uuid}/assets/{assetId}
```

> ⚠️ **경로는 `/cms` 입니다. `/admin` 이 아닙니다.** 이걸 몰라서 이 세션에서 오래 헤맸습니다.
> Worker가 `/api/v1/admin/*` 전체에 인증을 먼저 걸어서, 미인증 상태에서는 없는 경로도 401로 보입니다.
> 즉 **401은 "경로 존재"의 증거가 아닙니다.**

### 응답 코드 해석 [사실]
| 코드 | 의미 |
|---|---|
| 403 `origin_not_allowed` | Origin 불일치. **로컬 파일(file://)이나 localhost 에서는 항상 403** |
| 401 `unauthorized` | 인증 실패 또는 라우팅 이전 단계 |
| 404 | 인증은 통과, 경로/메서드가 실제로 없음 |

### 인증 방식 [사실]
`ADMIN_TOKEN` 없음. **Supabase 이메일 로그인 → JWT → Worker가 `ADMIN_EMAILS` 또는 `role==='website_admin'` 대조.**
- Supabase Auth: 이메일만 활성화(소셜 전부 off)
- 무료 플랜이라 **메일 템플릿 수정 불가** → 6자리 코드 발송 불가, 매직 링크만 가능
- 무료 플랜 **시간당 메일 발송 한도** 있음 (`over_email_send_rate_limit`)
- → ERP는 **비밀번호 로그인이 기본**, 매직 링크는 보조

### Supabase URL Configuration [사실 — 설정 완료됨]
```
Site URL: https://hm-sign-erp.dmswl1701.workers.dev
Redirect URLs: https://hm-sign-erp.dmswl1701.workers.dev/**
               https://hm-sign-website.pages.dev/**
```

---

## 4. 사진 역할(role) 구조 [사실 + 계획 혼재]

### Worker 허용값 [사실]
```js
const allowedRoles = new Set(['cover', 'before', 'after', 'gallery']);
```
**`progress` 는 아직 없습니다.** 추가하려면 Worker 소스 이 한 줄을 고쳐야 합니다.

### 홈페이지 처리 [사실 — 구현·단위테스트 완료]
`assets/site.js` 의 `ROLE_LABEL` / `ROLE_ORDER` / `groupByRole()`
```js
before → '시공 전'      progress/during/process → '제작·시공 과정'
after  → '시공 후'      cover → '대표 사진'      gallery → '현장 사진'
```
- 표 기반이라 **Worker에 `progress`를 추가하면 홈페이지는 코드 수정 없이 자동 반영**
- 모르는 role 이 와도 '현장 사진'으로 안전 수용
- 각 묶음 내부는 `sort_order` 준수
- 라이트박스는 전체 사진을 평탄화해 이어서 봄

검증한 케이스: cover+gallery / before+after / progress 추가 / 모르는 role / role 없음 / 빈 배열 / URL 없는 항목 — **7건 전부 통과**

### 현재 실데이터 [사실]
시공사례 **1건**뿐. 사진 2장, role은 `cover` `gallery`만. **before/after 실데이터 없음** → 실제 화면에서 Before/After 검증 불가.

---

## 5. 포트폴리오 표시 구조 [사실 — 구현·검증 완료]

### 목록 (`/works`)
- `loadPortfolioArchive()` — 24건씩 요청, **[시공사례 더 보기]** 로 이어 붙임 (`portfolioState`)
- 그리드 **full-bleed 100vw** (컨테이너 탈출), `auto-fill minmax(258px)`, 간격 8~12px
- 카드 비율 **4:3**, hover 시 사진 1.045배
- **정보는 평소 숨김 → hover 시 아래에서 올라옴** (네이비 딤 + Amber 라인 + 전구색 분류)
- `@media(hover:none)` 터치 기기는 정보 항상 표시
- 사례 수별 카드 폭: 1건 560px / 2건 430px / 3건 340px / 4건+ 258px 밀도

### 상세 (모달)
- `openPortfolioModal(id, slug, fallback)` — **slug 우선** 조회
- `groupByRole()` 로 단계별 섹션 렌더 (단계가 1개면 제목 숨김)
- 헤더에 카테고리·지역·등록일

### 라이트박스
- `openPortfolioLightbox(images, startIndex, title)`
- 좌우 버튼 / ESC / 모바일 스와이프(45px 임계) / 카운터

---

## 6. 로고 복구 [사실 — 완료]

리뉴얼(`8e8b3ee`)이 골드 가운뎃점을 삭제했던 것을 되돌렸습니다.
```
직전(d1e5de0):  HM<i>·</i>SIGN                    22px / 900 / -1.7px
리뉴얼:         <span>HM</span><span>SIGN</span>  inline-flex / 950 / -1.3px
복구(f7ffcb6):  HM<i>·</i>SIGN + aria-label       원래 값 복원
```
- `assets/site.css` 끝의 **"로고(브랜드) 표현 복원"** 블록이 리뉴얼 규칙을 덮어씀
- 헤더·푸터 두 곳 모두 적용
- **헤더 레이아웃(sticky·반투명)·내비·버튼은 리뉴얼 상태 유지** — 전체 롤백 아님

---

## 7. 디자인 방향 [사실 — 대표님 지시]

### 반드시 유지
- **HM·SIGN 로고** (골드 가운뎃점)
- **네이비** `--navy:#102b4b` / `--deep:#071524`
- **따뜻한 Amber / 전구색** `--gold:#efb05d` / `--glow-core:#ffd89a`
- **현재 Hero 건물 사진** `assets/hero.jpg` — **절대 교체 금지**
- 실제 시공사진 사용

### 타이포 원칙 (`site.css` 마지막 QA 블록)
```
--fs-hero > --fs-page > --fs-sec > --fs-sub   위계 고정
--w-head:750  --w-strong:700                  800↑ 최소화
--ls-hero:-.028em                             한글 자간 하한
```
- **"글자가 크고 굵어서 멋있어 보이는" 디자인 금지**
- 사진이 주연, 글자는 보조
- 한글 자간을 과하게 좁히지 말 것 (기존 -.065em → -.028em으로 완화한 이력)

---

## 8. 참고사이트 분석 [사실 — 영상 27프레임 확인]

`https://makesign.kr` — 대표님이 화면녹화 2개(26초/11초)를 제공, ffmpeg으로 프레임 추출해 확인함.

### 확인한 구성
| 요소 | 내용 |
|---|---|
| 메뉴 | **3개**뿐 (회사소개/포트폴리오/견적문의) |
| 포트폴리오 | 사진 467장 · 4열 · 4:3 · 간격 10px · **full-bleed** · **캡션 없음** |
| 페이징 | **없음** — 한 페이지 높이 28,758px |
| Before/After | **한 카드에 두 사진 나란히** + 작은 배지 + 아래 제목·1줄 설명 (2×2 그리드) |
| 간판종류 | **실사진 세로 패널 아코디언** — hover 시 확장되며 설명 노출 |
| 상세 | 좁은 중앙 모달, 사진 원본 비율 유지, 배경 딤 |
| 페이지 전환 | 흰 페이드 |
| 회사소개 | 중앙 정렬 제목 2줄 + 알약 CTA |
| 문의 CTA | 사진 배경 + 중앙 텍스트 + 알약 버튼 |

### 왜 세련돼 보이는가 — 원리
1. 사진이 컨테이너를 벗어나 화면 끝까지 닿음 → **밀도의 정체**
2. 그리드 위 제목이 사진보다 작음
3. 사진 간격이 좁음 (10px) → 작업량이 많아 보임
4. 그리드에 캡션이 없음 → 정보를 덜어냄
5. Before/After가 한 카드 안에 있어 비교가 즉시 됨

### 약점 (따라하면 안 되는 것)
- 카테고리 필터·페이징·상세페이지가 **없어** 규모가 커지면 탐색 불가
- 수백 장을 올릴 HM SIGN에는 부적합 → **원리만 차용하고 탐색성은 다르게 풀었음**

### 복제 금지 (대표님 지시)
동일한 레이아웃·섹션 순서·이미지 비율 조합·폰트·애니메이션·버튼 디자인·문구·Before/After UI 모양·카드 디자인

---

## 9. 검증 완료 항목 [사실 — 실제 브라우저 측정]

| 항목 | 결과 |
|---|---|
| 7개 페이지 라우팅 | 전부 200, 고유 title |
| 로고 (7페이지 × 375/768/1440) | 골드 점 `rgb(201,139,61)` 정상 |
| 타이포 (1920/1440/768/390) | Hero 3줄 유지, 가로스크롤 0 |
| 포트폴리오 full-bleed | 1920/1440/768/390 전부 뷰포트 폭과 일치 |
| 카드 비율 | 4:3 (1.33) 전 해상도 |
| 열 수 확장 | 1920에서 1/2/3/8건 → 3/4/5/**7열** |
| hover 규칙 | copy·shade·img·터치대체·Amber라인 전부 존재 |
| `groupByRole()` | 7개 케이스 단위 테스트 통과 |
| 상세 모달 | 실데이터로 단계 렌더 + 사진 2/2 로드 |
| 라이트박스 | "1 / 2" 카운터, 이미지 정상 |
| 공개 API | `/public/site` `/public/portfolio` 200 |
| 문의 API | POST 201 (테스트 데이터 1건 실제 저장됨) |

---

## 10. 미해결 / TODO

### 확인 안 된 것 [사실]
- ⚠️ **ERP 홈페이지 관리 저장이 실제로 되는지 확인 못 받음.** `/api/v1/cms/content/{key}` 경로로 고친 뒤 대표님 테스트 결과 미확인. **다음 세션에서 가장 먼저 확인할 것.**
- ⚠️ **ChatGPT가 ERP에 추가한 기능들(배치 업로드·WebP 변환·Draft 저장·slug 정규화)을 이 세션에서 검증하지 않았습니다.**
- ⚠️ 테스트 문의 1건이 CMS에 남아 있음 — `[테스트] 시스템점검` / `010-0000-0000` → 삭제 필요

### 미구현 [계획]
| 항목 | 상태 |
|---|---|
| `progress` role | Worker `allowedRoles` 에 추가 필요 (한 줄). 홈페이지는 준비 완료 |
| Before/After 카드 UI | 실데이터가 없어 미착수 |
| 간판종류 아코디언 (`/services`) | 현재 텍스트 목록. 실사진 패널로 전환 [계획] |
| 페이지 전환 모션 | 미구현 |
| 스크롤 진입 모션 | 미구현 |
| SEO 개방 | `robots.txt` 가 `Disallow: /`, 전 페이지 `noindex`. **정식 도메인 확보 후 해제** |
| `srcset` 반응형 이미지 | 미적용 |
| Turnstile 스팸 방지 | `turnstileSiteKey` 비어 있음 |

---

## 11. 절대 건드리면 안 되는 것

1. **`assets/hero.jpg`** — 대표님이 직접 고른 사진. 교체·삭제 금지
2. **로고** `HM<i>·</i>SIGN` + `site.css` 의 "로고(브랜드) 표현 복원" 블록
3. **전체 롤백 금지** — 리뉴얼(`8e8b3ee`) 결과는 유지하면서 부분 수정만
4. **CMS 데이터 구조 / 공개·관리자 API 계약**
5. **role·sort_order 원본** — AI가 채울 자리
6. **문의 폼 필드명** — `serviceType` `preferredDate` `website`(허니팟) `turnstileToken` `sourceUrl`
7. **ERP 기존 기능** — 거래처·견적·수금·작업·현장동선·주소검색·카카오·Supabase 동기화
8. **`index.html` 단일 파일 구조**(ERP) / **Cloudflare 배포 방식**
9. **AI Draft 자동 공개 금지** — 반드시 관리자 승인 후 공개

---

## 12. 향후 계획 [전부 계획 — 미구현]

### AI 직원 → 시공사례 Draft 자동생성
```
사진 다중 업로드 → AI 분석 → 프로젝트별 그룹화 → 대표사진 추천
→ Before/After/일반 분류 → 제목·분류·설명 초안 → ERP Draft 자동 생성
→ 관리자 검토 → 홈페이지 공개
```
- AI는 **Draft만** 생성. 자동 공개 금지
- AI 제목은 사진에서 확인 가능한 정보만 사용 (상호명 > 간판종류 > 업종 > 시공내용 > 지역)
- 상호를 못 읽으면 지어내지 말 것 → "상호 미확인 · 병원 외부 사인 시공" 형태
- AI 제안 항목: 제목·카테고리·대표사진·사진순서·한줄설명·alt·slug·검색키워드
- **별도 Anthropic API 키 + 서버(Workers) 필요** — 현재 미보유, 비용 발생
- 공개 API가 `status:published` 만 반환하므로 **Draft는 구조적으로 노출되지 않음** [사실]

### 비주얼 홈페이지 편집기
- ERP에서 홈페이지를 화면 보면서 편집 [계획]
- 현재는 폼 기반 편집(배너·회사정보·서비스·프로세스·SEO)

### 대량 사진 업로드 (약 800장 예정)
- ChatGPT가 배치 업로드·WebP 변환을 ERP에 구현한 것으로 보이나 **미검증**
- 요구사항: 진행률·성공/실패 개수·재시도·대표사진 지정·순서 변경·중복 감지·EXIF 회전·한글 파일명·브라우저 멈춤 방지

---

## 13. 다음 세션에서 가장 먼저 할 일

**1순위 — ERP 홈페이지 관리 저장 확인**
```
https://hm-sign-erp.dmswl1701.workers.dev/
→ 사이드바 버전 확인 (V43.0807.BATCH6 이상)
→ 🌐 홈페이지 관리 → 이메일+비밀번호 로그인
→ 배너 문구 수정 → 💾 홈페이지에 반영
```
성공 시 "홈페이지에 반영했어요 (N개 항목)". 실패 시 화면에 시도한 경로·응답코드가 표시되므로 그걸 보고 수정.

**2순위 — ChatGPT가 추가한 ERP 포트폴리오 기능 검증**
배치 업로드 / WebP 변환 / Draft 저장 / slug 정규화가 실제로 동작하는지.

**3순위 — 대표님 선택 대기 중이던 항목**
Before/After 카드 UI → 간판종류 아코디언 → 페이지 전환 모션 → 스크롤 모션 순으로 제안했고, 대표님이 순서를 정하지 않은 상태.

---

## 14. 개발 시 주의사항 [사실 — 이 세션에서 실제로 겪은 함정]

1. **로컬(file:// / localhost)에서는 CMS API가 항상 403** — Origin 제한. 반드시 배포 후 실제 주소에서 테스트.
2. **ERP 캐시** — `APP_BUILD` 를 배포마다 갱신하지 않으면 사용자에게 새 코드가 전달되지 않음. 사이드바 버전 표시를 클릭하면 캐시·서비스워커까지 지우고 새로고침됨.
3. **Cloudflare Pages `_redirects`** — `/about → /about.html 200` 같은 rewrite 를 넣으면 **308 무한 루프**. Pages가 확장자 없는 경로를 이미 처리하므로 넣지 말 것. (이 문제로 하위 페이지 6개가 접속 불가였던 이력)
4. **`_headers` 캐시** — `/assets/*` 전체를 `immutable` 로 걸면 CSS/JS 수정이 재방문자에게 영원히 전달되지 않음. 이미지만 장기 캐시, CSS/JS는 `max-age=0, must-revalidate` + `?v=` 버전 파라미터.
5. **401 ≠ 경로 존재** — CMS Worker는 인증을 라우팅보다 먼저 함.
6. **상세는 slug 로만** 조회됨 (id → 404).
7. **Node.js·wrangler 로컬 설치 안 함** — 대표님 방침. 배포는 GitHub push 자동배포만 사용.

---

## 15. 커뮤니케이션 방식 [사실 — 대표님 선호]

- 설명보다 결과물 우선. 중간 보고 최소화, 논리적으로 묶어서 보고
- 막히면 추측하지 말고 멈추고 알릴 것
- 테스트하지 않은 것을 완료라고 하지 말 것
- 대표님이 직접 해야 하는 설정(Cloudflare/Supabase)은 클릭 순서까지 안내
- 비밀키(service_role, 비밀번호, 계정 정보)는 채팅에 붙여넣지 않도록 안내할 것
