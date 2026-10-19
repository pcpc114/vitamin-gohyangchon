# 비타민고향촌과메기

공식몰 `https://vitamin25.co.kr`의 공개 상품 120개와 사업자 정보를 바탕으로 만든 정적 상품 안내 사이트입니다. 상품명·가격·판매 상태·옵션·원문 상세 사진과 텍스트를 보존하고, 주문·결제·회원·장바구니·주문 조회는 기존 공식몰로 연결합니다. 상품 자료 확인일은 **2026-10-20**이며 가격과 판매 상태는 실시간으로 동기화하지 않습니다.

## 현재 적용 상태

사이트를 GitHub와 Cloudflare Pages에 배포하고 운영 주소 **`https://vitamin25.com`**을 연결했습니다. Cloudflare 대시보드에서 DNS zone과 Pages 사용자 지정 도메인, SSL 인증서가 모두 활성 상태이며 공개 DNS를 기준으로 전체 운영 페이지와 리디렉션 검증을 통과했습니다. 기존 `https://vitamin25.co.kr`는 주문·결제를 담당하는 공식몰로 유지합니다. 로컬 프로젝트의 `dist/`는 로컬 주소 기준이며 Pages에서는 별도 공개 빌드로 운영 주소의 canonical을 생성합니다. 이 컴퓨터의 기본 DNS 조회 경로에는 이전 주소가 남아 있어 모든 네트워크에서 전파가 완료됐다고 판단하지 않습니다. 기존 공식몰과 이전 Sites 게시본은 변경하지 않았습니다.

`site.config.json`의 현재 설정은 다음과 같습니다.

- `url`: `http://localhost:52827`
- `productionUrl`: `https://vitamin25.com`
- `domainStrategy`: `separate` — 기존 공식몰과 별도 도메인에서 상품 안내를 운영하는 구성
- `searchVerification.google`, `naver`, `bing`: 모두 빈 문자열

생성 결과는 **색인 대상 HTML 145개와 noindex 404 페이지 1개**입니다. 여기서 색인 대상은 HTML과 사이트맵의 구성 기준이며, 외부 검색엔진에 등록되었다는 의미는 아닙니다.

| 구성 | 경로 | 개수 |
| --- | --- | ---: |
| 홈 | `/` | 1 |
| 전체·상품 분류 목록 | `/shop/`, `/shop/{분류}/` | 16 |
| 상품 상세 | `/products/{상품번호}/` | 120 |
| 가이드 목록 | `/guide/` | 1 |
| 과메기 가이드 | 제철·손질 차이·세트 선택 가이드 | 3 |
| 질문·답변 모음 | `/guide/questions/` | 1 |
| HTML 사이트맵 | `/sitemap/` | 1 |
| 브랜드·고객센터 | `/about/`, `/contact/` | 2 |
| 오류 페이지 | `/404.html` — 사이트맵 제외 | 1 |

공식몰 원본의 15개 상품분류는 전체 상품 화면의 선택 상자에서 유지합니다. 상단 메뉴 9개와 새 사이트의 16개 목록 분류는 별도 탐색 구성입니다.

## 실행과 검증

Node.js 20 이상을 사용합니다. 빌드는 개발 의존성이 필요하므로 처음에는 `npm ci`로 설치합니다. 생성된 `dist/`를 제공하는 로컬 서버와 정적·SEO·HTTP 검증은 Node.js만으로 실행할 수 있습니다.

```powershell
npm ci
npm run build
npm run check
npm run check:seo
$env:PORT = "52827"
npm run start
```

로컬 미리보기는 `http://localhost:52827/`입니다. `PORT`를 지정하지 않으면 서버 기본 포트는 4173이며, `PORT=0`은 사용 가능한 포트를 자동 선택합니다. 다른 포트를 사용하면 빌드의 대표 URL과 HTTP 검사 주소도 그 포트에 맞추세요.

서버를 실행한 상태에서 다른 터미널에서 HTTP 동작을 검사합니다.

```powershell
node scripts/verify-http.mjs
```

검사 기본 주소는 `http://localhost:52827`이며, 다른 서버 주소는 다음처럼 지정합니다.

```powershell
$env:PREVIEW_URL = "http://localhost:4173"
node scripts/verify-http.mjs
```

- `npm run build`: HTML·검색용 카탈로그·XML/이미지 사이트맵·robots.txt 생성
- `npm run check`: 원본 상품과 생성 HTML의 상품명·가격·상태·옵션·본문·경로·구조화 데이터 대조
- `npm run check:seo`: canonical·연결된 엔터티·상품 속성·화면 답변·검수 문장·이미지 메타데이터·사이트맵·저장된 수정일 검증. 재빌드하거나 수정일 자료를 변경하지 않음
- `node scripts/verify-http.mjs`: 원본 상품번호 120개의 301 이동, 대표 경로 별칭, 쿼리 유지, gzip, HEAD, 304, 정상 404와 발견용 경로 검사

빌드용 PurgeCSS는 `7.0.2`, `postcss-selector-parser` override는 `7.1.6`으로 고정했습니다. 2026-10-20의 `npm audit` 확인 결과 취약점은 0개입니다.

## SEO와 답변 콘텐츠

상품과 핵심 설명은 JavaScript 실행 전의 HTML로 제공합니다. 모든 상품의 원명과 목록 순서를 유지하며, 전체 화면에서 원본 분류 선택·구매 가능 상품 필터·가격순 정렬·24개씩 더 보기·상품 검색을 제공합니다.

분류별 페이지에는 실제 선택 상품의 개수·확인일 기준 판매 상태·수량 예시·포장 표시, 짧은 질문과 답변, 관련 분류 링크가 있습니다. 상품에는 수량·손질·포장·옵션과 공식몰 구매 방법을 설명하는 빠른 답변, 확인일과 원본 출처 링크를 표시합니다. 가이드 3편에는 핵심 답변·목차·검토 수정일·참고 자료·관련 상품 링크가 있으며, `/guide/questions/`에서 손질·진공·야채세트·선물·주문 질문을 모아볼 수 있습니다. `/sitemap/`은 상품 120개를 포함한 탐색 링크를 제공합니다.

제목·설명·H1·self-canonical, Open Graph와 Twitter 카드의 제목·설명·이미지·이미지 크기와 대체 설명을 생성합니다. JSON-LD는 같은 사이트 원점을 기준으로 `OnlineStore`, `WebSite`, `WebPage`와 용도별 페이지 엔터티, `BreadcrumbList`, `ItemList`, `Product`, `Article`을 연결합니다. 상품의 추가 속성은 원본 기본정보와 상품명에 근거합니다. 확인된 숫자 가격에만 `Offer`를 제공하고 구매 URL은 해당 공식몰 상품으로 연결합니다.

화면의 질문·답변에 `FAQPage`나 `QAPage` 구조화 데이터는 추가하지 않습니다. 확인되지 않은 평점·후기·GTIN·재고 수량·배송비도 생성하지 않습니다. 이름이 같은 별도 상품 SKU는 합치지 않고 실제 상품코드로 검색 제목을 구분합니다.

`data/seo-content.json`에는 활성 키워드 18개와 분류별 설명이 있습니다. 꽁치·청어·야채세트·손질·반손질·제철 키워드는 해당 상품과 안내 문맥에 배치합니다. 포항·구룡포 설명은 공식몰 자료에 근거하며 영덕과메기는 정보성 비교 문맥으로만 사용합니다. 사용자가 제외한 하모니과메기는 사용하지 않고, 다른 해산물에 과메기 키워드를 일괄 삽입하지 않습니다.

`lib/seo.mjs`는 HTML 콘텐츠와 메타데이터의 해시를 `data/page-revisions.json`에 보존합니다. 내용이 같으면 기존 수정일을 유지하고, 변경되면 한국 날짜 기준으로 갱신합니다. XML 사이트맵은 각 페이지의 저장된 `lastmod`와 대표·갤러리 이미지 URL을 포함하고, robots.txt는 같은 원점의 사이트맵을 안내합니다.

## 상세 이미지의 문장 안내와 충돌 정보

`data/product-detail-facts.json`에는 원본 상세 이미지에서 직접 확인한 안내와 이미지 출처·시각 검수 근거가 있습니다. **현재 상품 92개에 검수 문장 147개 구간**이 있습니다. 상세 이미지가 있는 이미지 중심 상품 80개는 모두 검토했으며, 그중 78개에 추가 문장을 제공합니다. 상품 89번·121번은 사진만 있어 새로운 안내 문장을 만들지 않았습니다. 전체 상세 이미지의 완전 전사나 모든 상품의 전체 내용 검수를 뜻하지 않습니다.

렌더러는 `verified === true`와 `evidence.method === 'visual_review'`를 모두 만족하고 내용이 비어 있지 않은 구간만 추가 문장으로 표시합니다. 검수하지 않은 OCR 후보와 원본에 없는 사실은 추가하지 않습니다. 영양·건강 효능, 유효성 미확인 인증·수상, 보관 기간, 임의 제철·원산지 같은 주장은 검수 문장으로 확장하지 않습니다. 원본 사진과 원문 자료는 보존하고 AI 생성 사진은 게시하지 않습니다.

포장 이름, 손질 제목, 크기, 중량·구성 표기가 원본 안에서 충돌하는 상품에는 확인 안내를 표시합니다. 충돌이 기록된 포장과 수량·구성 표기를 추가 상품 속성으로 새로 확정하지 않습니다. 배송 안내의 표에는 3,000원, 본문에는 4,000원으로 표시된 상충도 원문을 보존하며 **최종 배송비와 실제 출고 구성은 공식몰 주문서에서 확인**하도록 안내합니다. 확정 배송비 구조화 데이터는 만들지 않습니다.

추가사진 2개가 404인 상품 2번은 정상 대표·상세 사진을 사용하고, 원본 상세본문이 없는 상품 128번은 원본 요약과 기본정보를 제공합니다. 원본 자료와 가격·판매 상태가 달라지면 재수집·검수·빌드가 필요합니다.

## 공개 도메인 빌드와 검색 확인 태그

공개 빌드는 다음 명령입니다. `SITE_URL` 재정의가 없으면 설정된 **`https://vitamin25.com`**을 대표 URL로 사용해 `dist/`를 다시 생성합니다. 공개 빌드와 Cloudflare Pages 배포는 실행했으며, 로컬 작업 폴더의 미리보기 빌드와 구분해 관리합니다.

```powershell
npm run build:production
```

빌드의 대표 URL 선택 순서는 `SITE_URL` 환경변수가 가장 먼저이며, 그 값이 없으면 공개 빌드는 `productionUrl`, 일반 빌드는 `url`을 사용합니다. 대표 URL에는 경로·쿼리·인증정보를 넣지 않습니다. 공개 빌드는 HTTPS를 요구하고 localhost·127.0.0.1을 거부합니다. 현재 `separate` 설정에서는 기존 `https://vitamin25.co.kr`와 같은 원점을 새 사이트 주소로 사용할 수 없습니다. 이 검사는 URL 설정을 검사하며 도메인 소유권이나 실제 공개 연결까지 확인하는 기능은 아닙니다.

운영 도메인으로 빌드·검증할 때는 다음처럼 실행합니다. 검증기도 `SITE_URL`을 기준으로 생성 결과를 확인하므로 빌드와 검증에서 같은 환경변수를 유지해야 합니다.

```powershell
$env:SITE_URL = "https://vitamin25.com"
npm run build:production
npm run check
npm run check:seo
```

`productionUrl`만 사용해서 공개 빌드한 경우에도 두 검증기의 기본값은 로컬 `url`이므로, 검증 시에는 `SITE_URL=https://vitamin25.com`을 유지해야 합니다. 로컬 버전으로 다시 빌드할 때는 `Remove-Item Env:SITE_URL -ErrorAction SilentlyContinue`로 재정의를 해제하거나 로컬 원점을 명시합니다.

검색 서비스가 발급한 실제 메타 태그의 `content` 값은 설정 파일의 `searchVerification` 또는 환경변수로 제공할 수 있습니다. 비어 있지 않은 환경변수를 우선 사용하고, 그 값이 없으면 설정 파일을 사용합니다. 양쪽 모두 비어 있으면 태그를 생성하지 않습니다.

| 서비스 | 환경변수 | 설정 파일 키 | 생성 메타 태그 이름 |
| --- | --- | --- | --- |
| Google | `GOOGLE_SITE_VERIFICATION` | `searchVerification.google` | `google-site-verification` |
| 네이버 | `NAVER_SITE_VERIFICATION` | `searchVerification.naver` | `naver-site-verification` |
| Bing | `BING_SITE_VERIFICATION` | `searchVerification.bing` | `msvalidate.01` |

```powershell
# 필요한 서비스의 실제 발급 값만 설정한 뒤 같은 터미널에서 다시 빌드합니다.
$env:GOOGLE_SITE_VERIFICATION = "발급된 content 값"
$env:NAVER_SITE_VERIFICATION = "발급된 content 값"
$env:BING_SITE_VERIFICATION = "발급된 content 값"
```

태그 생성은 외부 계정의 소유권 확인이나 사이트맵 제출을 실행하지 않습니다. Google은 메타 태그 대신 Cloudflare DNS의 TXT 레코드로 도메인 속성 `sc-domain:vitamin25.com`의 소유권을 확인했습니다. 확인을 유지하려면 해당 TXT 레코드를 삭제하지 않아야 합니다.

**2026-10-20 Google Search Console에서 도메인 소유권 확인과 `https://vitamin25.com/sitemap.xml` 제출을 완료했습니다.** 사이트맵 상태는 `성공`이며 발견된 페이지는 145개, 동영상은 0개입니다. 홈의 실시간 URL 테스트는 06:06(KST)에 `Google에 등록할 수 있음`으로 통과했고, 색인 생성 요청도 접수되어 우선순위 크롤링 대기열에 추가되었습니다. 기존 색인 조회 상태는 `발견됨 - 현재 색인이 생성되지 않음`으로, 실제 색인은 아직 확인되지 않았습니다. 소유권 확인·사이트맵 처리 성공·요청 접수와 실제 페이지 색인·검색 노출은 각각 별개의 결과입니다.

**네이버·Bing 등록과 Merchant Center 설정은 아직 수행하지 않았습니다.** 사용자가 새 도메인에 기존 사이트와 메일을 사용하지 않는다고 확인한 뒤 vitamin25.com의 네임서버와 Pages 도메인 연결, SSL 설정을 완료했습니다. 현재 사이트의 주문·결제는 외부 공식몰에서 진행되며, 도메인 연결이 Merchant Center 등록이나 검색 노출 자격을 완료했다는 의미는 아닙니다. 실제 운영 URL의 200 응답·canonical·사이트맵·상품 데이터와 리디렉션은 공개 DNS 기준의 별도 검사에서 확인했습니다.

## GitHub와 Cloudflare Pages 배포

GitHub 비공개 저장소 `godqhr12312-maker/vitamin-gohyangchon`를 Pages 프로젝트 `vitamin-gohyangchon`에 연결했습니다. 운영 주소는 https://vitamin25.com/ 이며 Pages 기본 주소는 https://vitamin-gohyangchon.pages.dev/ 입니다. 아래 설정으로 자동 빌드·배포합니다.

2026-10-20(KST)에 다음 설정 상태를 대시보드에서 확인했습니다.

- OrangeWebsite의 구매 계정에서 네임서버를 `braelyn.ns.cloudflare.com`, `derek.ns.cloudflare.com`으로 저장했고 Cloudflare zone은 `Active`입니다.
- 루트 도메인 `vitamin25.com`은 `vitamin-gohyangchon.pages.dev`를 가리키는 Proxied CNAME이며, Pages 사용자 지정 도메인은 `Active`, SSL은 활성 상태입니다.
- Universal SSL의 `vitamin25.com`과 `*.vitamin25.com` 인증서가 `Active`이며 표시된 만료일은 2027-01-18입니다.
- Single Redirect 규칙을 활성화해 HTTP 또는 `www.vitamin25.com` 요청을 `https://vitamin25.com`으로 301 이동하도록 설정했습니다. 경로와 쿼리 문자열은 보존합니다.

Google과 Cloudflare의 공개 DNS 조회에서 새 주소 `104.21.18.168`, `172.67.182.194`를 확인했습니다. 이 주소를 사용하되 원래 URL의 호스트 이름과 SNI, 인증서 신뢰 체인을 검증하는 표준 TLS 연결로 2026-10-20 04:54(KST)에 다음 검사를 완료했으며 실패는 0개입니다. 인증서 검증을 끄거나 컴퓨터의 DNS 설정을 변경하지 않았습니다.

| 공개 DNS 기준 검사 | 결과 |
| --- | --- |
| 운영 HTML과 canonical·메타·상품 데이터 | 145개 모두 200, 일치 |
| 원본 상품번호 쿼리 이동 | 120개 모두 301 |
| 원본 상품명 경로 표본 | 5개 모두 301 |
| HTTP·www 대표 주소 이동과 경로·쿼리 보존 | 6개 모두 통과 |
| 루트·www 인증서 신뢰 검증 | 2개 모두 통과 |
| 정상 페이지의 noindex 누출 | 0개 |
| 없는 경로의 404·HEAD 응답 | 통과 |
| robots.txt·sitemap.xml의 ETag 조건부 요청 | 2개 모두 304 |

상세 결과는 `artifacts/vitamin25-production-public-dns-check.json`에 있습니다. HTML에는 실제 응답에 ETag가 없어 HTML의 304 동작을 검증 완료로 표시하지 않습니다.

이 컴퓨터의 기본 DNS 조회 경로는 Windows DNS 클라이언트 캐시를 비운 뒤에도 이전 주소 `82.221.143.1`을 반환했고, 해당 경로의 루트·www TLS 인증서는 `dns.icedns.is`여서 두 연결 모두 호스트 이름 검증을 통과하지 못했습니다. 2026-10-20 04:55:09(KST)의 읽기 전용 후속 조회에서 기존 A 응답의 TTL은 9,558초(약 2시간 39분)였습니다. 이는 그 조회 경로에서 관측한 캐시 값이며 전 세계 DNS 전파 완료 예정 시간이 아닙니다. 기본 DNS 경로의 전체 페이지 검증은 아직 완료하지 않았습니다. 기록은 `artifacts/vitamin25-system-dns-ttl.json`과 공개 DNS 검사 보고서에 보존합니다.

| 항목 | 설정 |
| --- | --- |
| Framework preset | None |
| Production branch | `main` |
| Root directory | 이 `package.json`이 있는 디렉토리. 저장소 루트라면 빈 값 |
| Build command | `npm ci && npm run build:cloudflare` |
| Build output directory | `dist` |
| Node.js | 20 이상 |
| Production·Preview 환경변수 | `SITE_URL=https://vitamin25.com` |

`build:cloudflare`는 `node build.mjs --production` 후 `scripts/prepare-cloudflare.mjs`를 실행합니다. 후처리는 HTML을 수정하지 않으며, 전체 canonical·robots·사이트맵이 `productionUrl`과 맞는지 확인한 뒤 `dist/_headers`, `_redirects`, `_routes.json`을 생성합니다. localhost 기준 결과는 업로드 준비 단계에서 오류로 차단합니다. 별도 명령 `npm run prepare:cloudflare`는 이미 생성한 공개 빌드의 설정만 준비하고, `npm run check:cloudflare`는 쓰기 없이 결과를 검사합니다. 두 정적 검증기도 실행하려면 같은 터미널의 `SITE_URL=https://vitamin25.com`을 유지하세요.

Production과 Preview 모두 같은 운영 주소를 canonical로 생성합니다. `pages.dev` 기본 주소와 미리보기 주소에는 호스트 패턴으로 `X-Robots-Tag: noindex`를 적용하며 vitamin25.com에는 적용하지 않습니다. preview의 noindex는 실제 응답에서도 확인해야 합니다. [Cloudflare 헤더 설정](https://developers.cloudflare.com/pages/configuration/headers/), [Preview 색인 안내](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

원본 상품 path와 숫자형 짧은 경로, slash·index 별칭은 301 규칙으로 생성합니다. `_redirects`의 쿼리 조건 제한 때문에 `/product/detail.html?product_no=상품번호`만 `functions/product/detail.html.js`에서 처리합니다. 이 Function은 배포된 경로 맵의 등록 상품번호와 `/products/동일번호/`만 허용하고, 나머지 쿼리는 유지하며 외부 주소를 목적지로 받지 않습니다. Function 응답에도 pages.dev noindex·nosniff를 직접 적용합니다. `_routes.json`은 이 한 경로만 Function에 전달합니다. [Pages 리다이렉트](https://developers.cloudflare.com/pages/configuration/redirects/), [Functions API](https://developers.cloudflare.com/pages/functions/api-reference/)

최상위 `404.html`을 유지하여 실제 없는 경로는 Pages의 404 응답으로 처리합니다. 직접 요청한 오류 페이지에는 noindex 헤더를 추가하며, 없는 경로에 표시되는 오류 HTML도 noindex 메타를 포함합니다. 압축·재검증·캐시는 Pages 기본 동작을 사용하고 임의의 장기 캐시 규칙을 추가하지 않습니다. 실제 임시 주소에서는 HTML에 ETag가 없었고, robots.txt·sitemap.xml의 ETag 조건부 요청은 304 응답을 확인했습니다. 로컬 `server.mjs`는 Pages에서 실행하지 않습니다. [Pages 기본 제공 동작](https://developers.cloudflare.com/pages/configuration/serving-pages/)

운영 도메인의 공개 DNS 기준 200·301·404 상태, canonical·사이트맵 원점, legacy 상품번호 이동, 쿼리 보존과 정상 페이지의 noindex 부재를 확인했습니다. Pages 기본 주소의 별도 배포 검사에서는 noindex 헤더를 확인했으며 오류 페이지의 색인 제한도 유지합니다. 공개 DNS 검사 통과와 이 컴퓨터의 기본 DNS 경로에서의 접속 가능 여부는 구분합니다. `vitamin25.co.kr`의 기존 주문·결제와 DNS는 변경하지 않았습니다.

## 접근성과 성능 검사

모바일에서도 상단 메뉴 9개를 표시하며, 좁은 화면에서는 3열로 배치합니다. 글자 대비, 제목 단계, 폼 레이블, 키보드 포커스와 링크의 접근성 이름을 보완했습니다. 화면 너비 780px 이하에서는 본문과 제목을 기기의 기본 한글 글꼴로 통일하고 데스크톱의 기존 글꼴 구성은 유지합니다.

`lib/page-styles.mjs`는 전체 HTML과 실제 `site.js`를 기준으로 페이지에서 쓰지 않는 CSS 선택자를 빌드 때 제거합니다. 동적 클래스·속성 상태와 dialog를 보존하고 미디어·supports 규칙의 순서를 유지하며, 같은 선택자 구성을 캐시합니다. 원본 약 55KB CSS는 페이지별 약 17~30KB로 줄어 HTML에 포함됩니다. 불완전한 HTML이나 처리 오류에는 원본 CSS를 사용합니다. **CSS 변경 후에는 반드시 다시 빌드해야 합니다.** 로컬 서버는 gzip·ETag·Last-Modified·304 응답을 제공하고, 화면 아래 일부 영역에는 `content-visibility:auto`를 적용합니다.

사진은 WebP 크기 변형과 `srcset`·`sizes`를 사용하고 하단 사진은 지연 로딩합니다. 홈 배너는 480px 이하에서 같은 원본 사진을 중앙 기준으로 잘라낸 AVIF **22,412바이트**를 사용하며 WebP **51,810바이트**를 대체 파일로 제공합니다. 기존 데스크톱 배너와 원본 사진은 유지합니다. 화면 크기에 맞는 첫 배너를 preload하고, 슬라이드를 바꿀 때는 첫 배너의 `picture` source를 제거해 다음 사진을 표시합니다. `scripts/optimize-images.py`는 모바일 AVIF 생성도 지원하며, 사진을 다시 생성하려면 Python·Pillow와 사용 가능한 AVIF 인코더가 필요합니다.

상품 갤러리의 작은 미리보기는 최대 128px WebP를 사용하며, 버튼의 `data-gallery-src`에는 원본 사진을 유지합니다. 46개 상품의 257개 미리보기 자리에서 사용하는 고유 이미지 169개의 용량을 7,421,296바이트에서 496,394바이트로 약 93% 줄였습니다. `python scripts/optimize-images.py --thumbnails-only`로 다시 만들 수 있으며 `data/gallery-thumbnails.json`에 원본 SHA와 파생 이미지 정보를 기록합니다. 원본 대표사진·상세사진은 변경하지 않았습니다.

Lighthouse 13.5.0은 Node.js 22.19 이상과 Chrome이 필요합니다. 일반 사이트 빌드용 패키지와 분리하여 도구 폴더에 설치합니다.

```powershell
npm install --prefix artifacts/lighthouse-tools --no-save --package-lock=false lighthouse@13.5.0
node scripts/audit-site.mjs --all-tabs --mode=both --out-dir=artifacts/mobile-100-final
node scripts/render-audit-summary.mjs --dir=artifacts/mobile-100-final
```

서버 실행 후 검사합니다. 기본 주소는 `http://localhost:52827`이며 필요하면 `--base-url`을 지정합니다. `--all-tabs`는 현재 사이트맵의 상품 상세를 제외한 경로를 선택하므로 질문 모음과 HTML 사이트맵도 포함합니다. 상품 상세는 `--routes=/products/1/ --mode=both`처럼 따로 검사할 수 있습니다. 두 경로 선택 옵션은 함께 쓰지 않습니다. 선택 옵션 `--save-trace`를 추가하면 성능 분석용 Chrome trace도 저장합니다.

2026-10-20(KST) 기준 **25개 탭과 추가 상품 상세 2개(15·32)의 최신 모바일 검사 결과는 모두 성능·접근성·권장사항·SEO 100점**입니다. 최신 결과는 `artifacts/mobile-100-final/summary.json`·`summary.csv`와 실행별 원본 LHR를 기준으로 확인하세요. 모바일 가이드·상품 상세의 단일 열 배치를 block으로 단순화하고 FAQ 텍스트의 불필요한 내재 크기 계산도 줄였습니다. 추가 웹폰트 실험은 최종 결과물에 포함하지 않았습니다. 점수는 측정 환경과 실행 시점에 따라 달라질 수 있으며, 상품 상세 120개 전부를 Lighthouse로 검사했다는 의미는 아닙니다.

이전 측정 원본과 요약은 `artifacts/seo-final-lighthouse/`에 보존하며 현재 변경의 최종 결과와 구분합니다. 보고서 생성기는 저장된 LHR를 공식 Lighthouse 렌더러로 HTML화하고 같은 폴더에 요약 `report.html`을 만들며 점수를 수정하거나 새 검사를 실행하지 않습니다.

Lighthouse SEO 점수는 기술 점검 결과입니다. 검색 순위·색인·방문량이나 AI 답변 인용은 별도 결과이며 점수만으로 보장되지 않습니다.

## 주요 파일

- `build.mjs`, `site.config.json`: 빌드·도메인 가드·대표 URL·사업자 정보·검색 확인 태그
- `lib/catalog.mjs`, `lib/catalog-view.mjs`, `lib/product-page.mjs`: 상품 정규화·분류·목록·상세·빠른 답변
- `lib/seo.mjs`, `lib/guide-page.mjs`, `lib/information-pages.mjs`: 엔터티 연결·수정일·발견용 파일·가이드·질문 모음·HTML 사이트맵
- `lib/page-styles.mjs`: 페이지별 CSS 선택자 제거·동적 상태 보존·캐시
- `data/catalog.json`, `data/import-report.json`: 원본 공개 상품과 수집·분류 대조 자료
- `data/product-detail-facts.json`: 상세 이미지의 검수 문장·근거·누락 범위·충돌 기록
- `data/seo-content.json`, `data/guides.json`: 키워드별 설명과 출처가 있는 가이드 3편
- `data/page-revisions.json`, `data/image-metadata.json`: 내용 변경 이력과 이미지 메타데이터
- `data/responsive-images.json`, `lib/responsive-images.mjs`: 반응형 사진 목록과 HTML 속성
- `dist/`: 생성된 HTML·사진·CSS·JavaScript·robots.txt·사이트맵
- `verify.mjs`, `scripts/verify-seo.mjs`, `scripts/verify-http.mjs`: 정적·SEO·실제 HTTP 검증
- `scripts/import-catalog.py`, `scripts/optimize-images.py`: 공개 카탈로그 재수집과 사진 최적화 도구
- `scripts/audit-site.mjs`, `scripts/render-audit-summary.mjs`: Lighthouse 순차 검사와 원본·요약 HTML 보고서
- `scripts/prepare-cloudflare.mjs`, `functions/product/detail.html.js`: Pages 배포 원점 검증·정적 설정 생성·원본 상품번호 쿼리 이동
- `artifacts/product-url-map.csv`: 원본 상품 URL과 새 상세 경로의 대응표
