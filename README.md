# 비타민고향촌과메기

실제 공식몰 vitamin25.co.kr의 상품 16개와 공개 사업자 정보를 바탕으로 제작한 정적 웹사이트입니다. 참고 사이트의 흰색 헤더, 바다색 브랜드, 큰 사진 배너, 상품 목록 중심 구조를 반영했습니다. 결제·회원·장바구니·주문 조회는 기존 카페24 공식몰로 연결합니다.

## 실행

Node.js 20 이상에서 별도 패키지 설치 없이 실행합니다.

```powershell
node build.mjs
node verify.mjs
node server.mjs
```

미리보기: http://127.0.0.1:4173/

## 파일

- `build.mjs`: 상품·분류·브랜드·고객센터·가이드 HTML 생성
- `site.config.json`: 사이트 대표 URL, 상호, 상담 연락처와 사업자 정보
- `data/products.json`: 2026-10-20 공식몰에서 확인한 상품·가격·출처
- `data/guides.json`: 새로 작성한 과메기 가이드 3편
- `data/hero-images.json`, `data/detail-images.json`: 실제 사진의 원본 URL 및 크롭 출처
- `dist/`: 배포할 정적 파일, 압축 WebP, CSS·JavaScript, 사이트맵
- `verify.mjs`: 메타데이터·구조화 데이터·내부 경로·상품 가격 검사

## SEO 적용

주요 콘텐츠와 링크를 JavaScript 실행 전의 HTML로 제공합니다. 고유 title·description, H1, self-canonical, Open Graph, Organization·WebSite·BreadcrumbList·Product·Article JSON-LD, sitemap.xml, robots.txt를 생성합니다. 상품 가격은 확인한 실제 값만 사용하며 확인되지 않은 평점·후기·재고 상태는 만들지 않습니다. 기본 사진에는 크기와 대체 설명을 지정하고 아래쪽 사진은 지연 로딩합니다.

꽁치·청어·야채세트·손질·반손질·제철 키워드는 관련 상품과 가이드에 배치했습니다. 포항·구룡포의 설명은 기존 공식몰에 근거합니다. 영덕과메기는 정보성 비교 맥락으로만 사용합니다. 하모니과메기는 비타민고향촌과메기와의 관계가 확인되지 않아 넣지 않았습니다.

## 실제 운영 도메인 적용

현재 Sites 게시본은 소유자 전용 비공개 미리보기입니다. 비공개 상태에서는 검색엔진이 본문을 수집할 수 없습니다. 기존 vitamin25.co.kr는 수정하지 않았습니다.

기존 도메인에 적용하려면 카페24에서 디자인과 개별 페이지를 옮기거나 이 사이트를 실제 공개 도메인에서 제공하도록 호스팅을 연결해야 합니다. 원래 상품 URL과 결제 기능을 보존하는 카페24 적용이 기존 검색 이력을 유지하는 데 적합합니다. 이 `dist`를 카페24에 그대로 업로드한다고 쇼핑몰 스킨으로 자동 적용되는 구조는 아닙니다.

1. 적용할 실제 운영 URL에 맞춰 `site.config.json`의 `url`을 바꾸고 다시 빌드합니다. 경로를 바꾸는 이전이라면 기존 URL과 새 URL을 일대일 매핑하여 301 리디렉션을 설정합니다.
2. 공개 접근, 정상 200 응답, self-canonical과 sitemap의 실제 운영 URL 일치를 확인합니다. 테스트용 사이트를 동시에 색인하지 않습니다.
3. 네이버 서치어드바이저와 Google Search Console에서 실제 도메인 소유권을 확인한 뒤 sitemap.xml을 제출합니다. 확인용 태그·파일은 발급받은 실제 값만 사용합니다.
4. 실제 운영 사이트의 모바일 성능과 상품 구조화 데이터를 다시 검사합니다. 같은 도메인에서 직접 구매할 수 있도록 구현하지 않은 소개 페이지는 Google merchant listing 지원 대상과 다릅니다.
5. 상품 가격·판매 상태가 달라지면 data/products.json을 갱신하고 빌드·배포합니다. 현재 코드는 공식몰 가격을 실시간 동기화하지 않습니다.

검색 순위와 방문량은 경쟁도·도메인 이력·콘텐츠·수집 상태 등에 따라 달라집니다.

## 기준 문서

- https://developers.google.com/search/docs/appearance/title-link
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- https://developers.google.com/search/docs/essentials/spam-policies
- https://searchadvisor.naver.com/guide/markup-content
- https://searchadvisor.naver.com/guide/seo-basic-robots
- https://searchadvisor.naver.com/guide/request-feed

사진은 사용자가 본인 사이트로 제공한 공식몰에서 가져왔으며, AI 생성 사진은 게시하지 않았습니다. 덕장 사진은 공식몰에 실린 기존 사진이며 원본 날짜 표시를 보존했습니다.
