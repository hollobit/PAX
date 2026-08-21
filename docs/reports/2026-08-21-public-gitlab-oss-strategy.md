# 공공 깃랩의 다음 단계 — 기업 오픈소스 전략·주요국 공공 코드 정책 비교

작성: 2026-08-21 · 근거: PAX 관측 데이터(195건, 공공 깃랩 38건) + 2024~2026 해외 정책 웹 조사
목적: 공공 깃랩(gitlab.aigov.go.kr)이 "저장소 개설"을 넘어 국가 코드 자산 체계로 성장하기 위해
고려·개선해야 할 것을, 기업의 검증된 관행과 각국의 법·제도에서 추출한다.

---

## 요약 — 다섯 문장

1. 한국 공공 깃랩은 **세계에서 가장 빠르게 채워지는 정부 코드 저장소** 중 하나지만(개설 한 달 만에 1,000명·405프로젝트, PAX 관측 사례 38건), 라이선스 명시율 36%·외부 공개율 18.4%라는 관측치는 **"올리는 문화"는 생겼는데 "재사용되는 자산"의 조건은 아직 없다**는 뜻이다.
2. 미국은 권고(2016 연방 소스코드 정책)가 8년간 실패한 끝에 **법률(SHARE IT Act, 2024.12)로 전환**했다 — 의무 없는 공유 정책은 작동하지 않는다는 것이 미국의 결론이다.
3. 스위스(EMBAG)·영국(Service Standard)·프랑스는 **공개를 기본값**으로 뒤집었고, 독일(openCoDE)·이탈리아(Developers Italia)는 저장소와 별개의 **검증 카탈로그**로 "찾아서 가져다 쓰는" 단계를 만들었다.
4. 기업 측에서는 **OSPO**(전담 거버넌스 조직)와 **이너소스**(사내 개발을 오픈소스 방식으로)가 표준 관행이 됐다 — 공공 깃랩은 사실상 "범정부 이너소스 플랫폼"이므로 이 패턴들이 그대로 이식된다.
5. 최우선 개선은 비용이 거의 들지 않는 것부터다: **저장소 생성 시 라이선스 선택 필수화**, **외부 공개(미러) 절차의 표준화**, **재사용 지표의 공표**. PAX는 이 셋의 독립 관측을 이미 시작했다.

---

## 1. 한국 공공 깃랩의 현재 좌표 (PAX 관측, 2026-08-21)

| 지표 | 값 | 해석 |
|---|---|---|
| 관측 사례 | 38건 (전체 195건 중) | 개설 초기 대비 빠른 유입 — 행안부 공문 안내 효과 |
| 라이선스 명시율 | **36%** (GitHub 사례는 78%) | 저장소는 공개됐지만 법적으로 재사용 조건이 없는 코드가 3분의 2 |
| 외부(GitHub) 공개율 | **18.4%** (미러 쌍 7) | 내부망산 도구의 대부분이 외부 생태계와 단절 |
| 스타 합계 | 162★ (GitHub 사례는 15,896★) | 반응·발견 문화가 아직 형성 전 |
| 유지보수 | 전원 활발 | 개설 초기라 자연스러움 — 1년 후가 진짜 신호 |
| 질적 관측 | 가입 승인 지연, 내장 실험환경 실사용 혹평, 프로필 실명제(신원 신뢰의 원천), 미러 병기 관행 자생 | 플랫폼 마찰과 자생 관행이 공존 |

핵심 문제의식: 지금의 공공 깃랩은 **"업로드 장소"**다. 각국 사례가 보여주는 다음 단계는
**"권리가 정리된 자산의 등록소"**(라이선스·재사용 조건), 그다음이 **"검증된 솔루션의 카탈로그"**(찾기·평가·이식)다.

---

## 2. 주요국 공공 코드 정책 — 무엇이 다른가

### 미국 — 권고의 실패, 법률로의 전환

2016년 연방 소스코드 정책(M-16-21)은 맞춤개발 코드의 목록화와 20% 오픈소스화를 지시하고
code.gov를 만들었지만, 강제 장치가 없어 8년 뒤에도 13개 기관이 인벤토리를 내지 않았다.
그 실패의 답이 [SHARE IT Act(Public Law 118-187, 2024.12.23 서명)](https://www.congress.gov/118/plaws/publ187/PLAW-118publ187.pdf)다
([해설](https://www.mofo.com/resources/insights/250113-share-it-act-requires-agencies), [FedScoop](https://fedscoop.com/agencies-must-share-custom-source-code-under-new-share-it-act/)):

- 정부 예산으로 개발된 맞춤 코드는 **기관이 소유**하고, **최소 1개 저장소에 보관**하며, **연방 정부 전체가 접근·공유·수정할 수 있어야** 한다.
- **조달 계약 단계에서** 정부 전체의 사용·수정 권리를 확보하도록 의무화 — 권리 문제를 사후가 아니라 계약서에서 푼다.
- 상용(COTS)·기밀·국가안보 시스템은 제외.

**한국 시사점**: 공공 깃랩 업로드가 "권고·문화"에 머무는 한 미국의 2016~2024 경로를 반복할 수 있다.
"정부 개발 코드의 정부 내 공유"는 법제화가 가능한 최소선이며, 특히 **용역 계약 표준조항**(소스·수정권 확보)은 법 이전에 조달 지침으로도 시작할 수 있다.

### 스위스 — 공개가 기본값인 법 (EMBAG)

[EMBAG(전자정부법, 2024.1 시행)](https://interoperable-europe.ec.europa.eu/collection/open-source-observatory-osor/news/new-open-source-law-switzerland)은
연방정부가 개발했거나 발주한 소프트웨어의 소스코드를 **"공개하지 않을 사유가 없는 한 공개"**하도록
법으로 정한 세계 첫 사례군이다 — "Public Money, Public Code"의 법제화
([FOSDEM 발표](https://archive.fosdem.org/2024/schedule/event/fosdem-2024-3401-the-new-swiss-open-source-law-public-money-public-code-by-default/)).
제3자 권리·보안 우려는 예외 사유로 관리한다.

**한국 시사점**: "공개할 것을 고르는" 현재 방식(opt-in)과 "비공개 사유를 소명하는" 방식(opt-out)은
결과가 정반대다. 개방율 18.4%는 opt-in 구조의 자연스러운 산물이다.

### 영국 — 표준 항목으로서의 공개, 그리고 현실적 경계

영국 [Service Standard](https://www.gov.uk/service-manual/technology/making-source-code-open-and-reusable)는
"새 소스코드를 공개하고 오픈 라이선스로 배포"를 서비스 심사 항목으로 두고,
[GDS Way](https://gds-way.digital.cabinet-office.gov.uk/standards/source-code/)가 저장소 관행(공개 기본, 예외 목록)을 문서화한다.
주목할 것은 ["coding in the open"과 오픈소스의 구분](https://gds.blog.gov.uk/2012/10/12/coding-in-the-open/) —
공개는 하되 커뮤니티 지원·유지보수를 약속하지는 않는다는 **현실적인 기대 관리**다.
[보안 우려에 대한 실무 지침](https://technology.blog.gov.uk/2017/09/27/dont-be-afraid-to-code-in-the-open-heres-how-to-do-it-securely/)도 함께 제공한다.

**한국 시사점**: "공개하면 유지보수 책임을 져야 하나"라는 공포가 공개를 막는다(PAX 챔피언 관측과 동일 구조).
영국식 구분 — 공개 ≠ 지원 약속 — 을 깃랩 문화 규범으로 명문화하면 공개 장벽이 낮아진다.

### EU·독일·이탈리아·프랑스 — 저장소와 카탈로그의 분리

- **EU**: [code.europa.eu](https://about.code.europa.eu/)는 EU 기관들의 공동 개발 플랫폼(깃랩 기반)이고,
  별도의 [EU OSS Catalogue](https://interoperable-europe.ec.europa.eu/eu-oss-catalogue/about)가 각국 카탈로그를 API로 연합해 모은다 — **저장소(개발)와 카탈로그(발견·재사용)의 이층 구조**.
- **독일**: [openCoDE](https://interoperable-europe.ec.europa.eu/eu-oss-catalogue/source/hosting_platform:open_code)는 "다른 행정기관에서 성공적으로 사용된 **검증된** 오픈소스 솔루션"의 공식 카탈로그 — 올라온 코드가 아니라 **검증된 코드**를 보여준다.
- **이탈리아**: Developers Italia는 카탈로그에 더해, 행정기관이 소프트웨어를 조달하기 전 **기존 공공 코드의 재사용 가능성을 먼저 평가할 법적 의무**(디지털행정법 CAD 68·69조)와 연결되어 있다 — 카탈로그가 조달 절차에 꽂혀 있는 구조.
- **프랑스**: 소스코드를 **행정문서로 간주**(정보공개 대상)하는 법 해석 위에 code.gouv.fr 카탈로그를 운영한다.

**한국 시사점**: 공공 깃랩 하나에 저장·발견·검증을 다 맡기면 어느 것도 잘 안 된다.
"AI 정부 실험실 보드"(프로젝트 목록)가 카탈로그의 맹아지만, 검증·재사용 조건·조달 연계가 없다.
**저장소(깃랩) ↔ 검증 카탈로그 ↔ 조달·도입 절차**의 삼층 연결이 유럽이 보여주는 설계다.

---

## 3. 기업 오픈소스 전략에서 가져올 것

### OSPO — 거버넌스에는 주인이 필요하다

[OSPO(Open Source Program Office)](https://ospobook.todogroup.org/01-chapter/)는 기업 오픈소스 운영의
표준 조직이다: 라이선스 정책과 컴플라이언스, 사용·기여·공개 정책, 교육, 커뮤니티 관리를 전담한다
([TODO Group 정의](https://github.com/todogroup/ospodefinition.org)). 핵심 교훈은 단순하다 —
**라이선스·공개·기여의 규칙은 개별 개발자가 알아서 정할 일이 아니라 조직이 정해 주는 것**이다.
공공 깃랩의 라이선스 명시율 36%는 규칙의 부재이지 개발자의 태만이 아니다.

### 이너소스 — 공공 깃랩의 정확한 거울

[이너소스](https://innersourcecommons.gitbook.io/managing-innersource-projects/governance)는 조직 내부 개발에
오픈소스 방식(공개 저장소·이슈·PR·문서)을 적용하는 관행으로, 공공 깃랩은 구조적으로 **"범정부 이너소스"**다.
이너소스 커뮤니티가 축적한 패턴 중 공공 깃랩에 바로 이식되는 것:

- **기여 가이드(CONTRIBUTING) 표준 템플릿** — 저장소마다 "어떻게 참여하나"가 있어야 타 기관 재사용이 기여로 이어진다.
- **[오픈소스 공개 전 이너소스 단계](https://github.com/InnerSourcePatterns/blob/main/patterns/1-initial/innersource-before-open-source.md)** — 내부(깃랩) 공개로 품질·권리를 다듬은 뒤 외부(GitHub) 공개로 가는 2단계 경로의 공식화. 지금 자생적으로 나타난 미러 관행이 바로 이것이다.
- **메인테이너·트러스티드 커미터 역할의 명시** — 유지보수 책임을 개인의 선의가 아니라 역할로 정의 (PAX 로드맵의 챔피언 역할 인증과 동일 방향).
- **발견성 장치** — 프로젝트 README 표준, 분류 태그, 조직 차원의 카탈로그.

### 컴플라이언스·보안 관행

- **라이선스 게이트**: 기업들은 저장소 생성·배포 시점에 라이선스 검사를 자동화한다. 깃랩 프로젝트 생성 양식에서 라이선스 선택을 필수로 만드는 것만으로 명시율 문제의 대부분이 사라진다.
- **SBOM·취약점 관리**: 공개 코드의 공급망 책임은 SBOM으로 관리한다 — 공공 깃랩 안에 이미 KODA SBOM Tracker(폐쇄망 SBOM 포털)라는 자생 도구가 있다. 내부 자산으로 채택할 후보가 내부에 있는 셈이다.
- **지표 운영**: 기업 OSPO는 기여자 수·재사용 비율 같은 지표로 성과를 관리한다. 공공판 지표는 "타 기관 재사용 건수, 외부 공개율, 라이선스 명시율" — PAX가 분기 지수로 이미 산출을 시작했다.

---

## 4. 개선 제언 — 우선순위와 실행 주체

| # | 제언 | 근거 관측 | 벤치마크 | 비용 |
|---|---|---|---|---|
| 1 | **저장소 생성 시 라이선스 선택 필수화** (권장 기본값: MIT 또는 Apache-2.0, 공공누리 병행 안내) | 명시율 36% — 재사용 조건 없는 코드 2/3 | 기업 라이선스 게이트 | 극소 (플랫폼 설정) |
| 2 | **외부 공개(미러) 절차 표준화** — 내부 검증 후 GitHub 미러를 공식 경로로 문서화, "공개 ≠ 지원 약속" 명문화 | 개방율 18.4%, 미러 관행 자생 중 | 이너소스→오픈소스 2단계, 영국 coding in the open | 소 (지침 1건) |
| 3 | **용역 계약 표준조항** — 정부 발주 개발물의 소스·수정권 확보와 깃랩 등록 의무 | 신규 개발물 다수가 깃랩 밖 | 미국 SHARE IT Act 계약 요건 | 소 (조달 지침) |
| 4 | **정부 OSPO 기능 신설** — 행안부 AI실험실의 역할을 라이선스 정책·기여 가이드 템플릿·교육·분쟁 창구로 확장 | 규칙 부재가 명시율·공개율의 원인 | 기업 OSPO, TODO Group | 중 (조직 역할) |
| 5 | **검증 카탈로그 분리** — 저장소와 별개로 "타 기관 사용 검증" 카탈로그(재사용 이력·설치 가이드·담당 역할 표기) 구축, 장기적으로 조달 전 재사용 검토와 연결 | 재사용 신호 부재, 실험실 보드는 목록 수준 | 독일 openCoDE, 이탈리아 CAD 68·69 | 중 |
| 6 | **"정부 내 공유 의무"의 제도화 검토** — 권고→훈령→법의 단계, 최종적으로 opt-out 공개 기본값 | 미국 8년 실패의 교훈 | SHARE IT Act, 스위스 EMBAG | 대 (입법) |
| 7 | **SBOM·보안 게이트 도입** — 공개 저장소의 취약점 스캔, KODA류 도구의 공식 채택 검토 | 보안 우려가 공개 반대 논리로 사용됨 | OpenSSF, 기업 공급망 관행 | 중 |
| 8 | **플랫폼 지표 공표** — 개방율·명시율·재사용·활성도를 분기 공개 | 자기 관측 부재 | CHAOSS류 지표, EU 카탈로그 통계 | 소 |

**PAX의 역할**: 1·2·8의 독립 관측은 이미 가동 중이다(라이선스 태깅, 미러 추적, 분기 지수).
여기에 ⓐ 재사용 계보(parent_case) 관측 확대, ⓑ 깃랩 라이선스 명시율의 분기 추이 공표,
ⓒ 이 보고서의 제안을 관계 기관(행안부 AI실험실·NIA) 접점에 전달하는 것이 다음 행동이다.

---

## 5. 한 장 비교표

| | 한국 (현재) | 미국 | 스위스 | 영국 | 독일·이탈리아·EU |
|---|---|---|---|---|---|
| 공유의 근거 | 공문 안내(권고) | **법률** (SHARE IT) | **법률** (EMBAG) | 서비스 표준(심사) | 카탈로그+재사용 의무(伊) |
| 공개 기본값 | opt-in (선택 공개) | 정부 내 공유 의무 | **opt-out 공개** | 공개 기본 | 국가별 상이 |
| 계약 권리 | 관행 의존 | **계약 조항 의무** | 발주분 포함 | 지침 | — |
| 저장소/카탈로그 | 저장소만 | repo+인벤토리 | — | GitHub 관행 | **이층 구조** (저장소↔검증 카탈로그) |
| 라이선스 규율 | 없음 (명시율 36%) | — | 오픈 라이선스 | 오픈 라이선스 필수 | 카탈로그 등재 요건 |
| 전담 거버넌스 | AI실험실(맹아) | 각 기관 CIO | 연방 디지털청 | GDS | 각국 디지털청 |

---

### 출처

미국: [SHARE IT Act 원문(PL 118-187)](https://www.congress.gov/118/plaws/publ187/PLAW-118publ187.pdf) · [Morrison Foerster 해설](https://www.mofo.com/resources/insights/250113-share-it-act-requires-agencies) · [FedScoop](https://fedscoop.com/agencies-must-share-custom-source-code-under-new-share-it-act/) · [Federal News Network](https://federalnewsnetwork.com/it-modernization/2025/01/agencies-required-to-share-custom-software-under-new-law/)
스위스: [OSOR: New Open Source law in Switzerland](https://interoperable-europe.ec.europa.eu/collection/open-source-observatory-osor/news/new-open-source-law-switzerland) · [FOSDEM 2024 발표](https://archive.fosdem.org/2024/schedule/event/fosdem-2024-3401-the-new-swiss-open-source-law-public-money-public-code-by-default/)
영국: [GDS: Coding in the open](https://gds.blog.gov.uk/2012/10/12/coding-in-the-open/) · [GDS Way: source code](https://gds-way.digital.cabinet-office.gov.uk/standards/source-code/) · [보안 실무 지침](https://technology.blog.gov.uk/2017/09/27/dont-be-afraid-to-code-in-the-open-heres-how-to-do-it-securely/)
EU·독일: [code.europa.eu](https://about.code.europa.eu/) · [EU OSS Catalogue](https://interoperable-europe.ec.europa.eu/eu-oss-catalogue/about) · [openCoDE 소개](https://interoperable-europe.ec.europa.eu/eu-oss-catalogue/source/hosting_platform:open_code)
기업 관행: [TODO Group OSPO 정의](https://github.com/todogroup/ospodefinition.org) · [OSPO Book](https://ospobook.todogroup.org/01-chapter/) · [InnerSource Commons: Governance](https://innersourcecommons.gitbook.io/managing-innersource-projects/governance) · [InnerSource before Open Source 패턴](https://github.com/InnerSourceCommons/InnerSourcePatterns/blob/main/patterns/1-initial/innersource-before-open-source.md)
한국 관측: PAX 공공 AX 지수 2026Q3 (hollobit.github.io/PAX/observatory.html)
