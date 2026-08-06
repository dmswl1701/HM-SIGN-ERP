# HM SIGN ERP

간판 제작·시공 업무관리 시스템. `public/index.html` 단일 파일로 동작합니다.

## 배포

**GitHub `main` 브랜치에 push 하면 자동 배포됩니다.** (Cloudflare Workers Builds)

- 운영 주소: https://hm-sign-erp.dmswl1701.workers.dev
- 배포 설정: [`wrangler.jsonc`](./wrangler.jsonc)
- 로컬에 Node.js·Wrangler 설치가 필요 없습니다.

배포 진행 상황은 Cloudflare 대시보드에서 확인합니다.
`Workers & Pages → hm-sign-erp → Deployments`

## 폴더 구조

```
public/index.html   ERP 본체 (HTML + CSS + JavaScript 단일 파일)
wrangler.jsonc      Cloudflare 배포 설정
package.json        wrangler 버전 고정
```

## 연동

| 대상 | 용도 |
|---|---|
| Supabase (`ndjxdwsvgoxzzrszsycj`) | 견적·거래처·수금·작업 데이터 동기화 (`hm_data` 테이블) |
| Kakao API | 주소 검색, 지도, 견적 이미지 공유 |
| CMS Worker (`hm-sign-website-cms`) | 홈페이지 관리 (관리자 이메일 로그인 후 사용) |

## 수정 시 주의

- `public/index.html` 은 단일 파일 구조입니다. 파일을 분리하지 마세요.
- 기존 기능(거래처·견적·수금·작업·현장·주소검색)을 삭제하지 마세요.
- Supabase 테이블 구조를 변경하지 마세요. 필요한 항목은 추가만 합니다.
