# 공공 깃랩의 다음 단계 — 기업 오픈소스 전략·주요국 공공 코드 정책 비교

작성: 2026-08-21 · 근거: PAX 관측 데이터(195건, 공공 깃랩 38건) + 2024~2026 해외 정책 웹 조사
목적: 공공 깃랩(gitlab.aigov.go.kr)이 "저장소 개설"을 넘어 국가 코드 자산 체계로 성장하기 위해
고려·개선해야 할 것을, 기업의 검증된 관행과 각국의 법·제도에서 추출한다.

---

## 요약 — 여섯 문장

1. 한국 공공 깃랩은 **세계에서 가장 빠르게 채워지는 정부 코드 저장소** 중 하나지만(개설 한 달 만에 1,000명·405프로젝트, PAX 관측 사례 38건), 라이선스 명시율 36%·외부 공개율 18.4%라는 관측치는 **"올리는 문화"는 생겼는데 "재사용되는 자산"의 조건은 아직 없다**는 뜻이다.
2. 미국은 권고(2016 연방 소스코드 정책)가 8년간 실패한 끝에 **법률(SHARE IT Act, 2024.12)로 전환**했다 — 의무 없는 공유 정책은 작동하지 않는다는 것이 미국의 결론이다.
3. 스위스(EMBAG)·영국(Service Standard)·프랑스는 **공개를 기본값**으로 뒤집었고, 독일(openCoDE)·이탈리아(Developers Italia)는 저장소와 별개의 **검증 카탈로그**로 "찾아서 가져다 쓰는" 단계를 만들었다.
4. 기업 측에서는 **OSPO**(전담 거버넌스 조직)와 **이너소스**(사내 개발을 오픈소스 방식으로)가 표준 관행이 됐다 — 공공 깃랩은 사실상 "범정부 이너소스 플랫폼"이므로 이 패턴들이 그대로 이식된다.
5. 추가 조사의 가장 중요한 발견: **한국은 거버넌스 자산이 없는 게 아니라 흩어져 있다** — NIPA의 공공 오픈소스 거버넌스 가이드(RFP 예시 포함)·오픈소스 포털의 라이선스 검증·교육 체계가 이미 있으나 공공 깃랩(행안부)과 연결되어 있지 않다. EU가 2026 기술주권 패키지에서 공공 OSPO 네트워크·유지관리 재원·조달 연계로 간 길이 정확히 이 연결의 설계도다.
6. 최우선 개선은 비용이 거의 들지 않는 것부터다: **저장소 생성 시 라이선스 선택 필수화**, **외부 공개(미러) 절차의 표준화**, **재사용 지표의 공표**. PAX는 이 셋의 독립 관측을 이미 시작했다.

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

## 3½. 추가 조사 반영 — 한국의 기존 자산과 국제 규범의 최신 좌표

### 한국에 이미 있는 것 — 새 제도가 아니라 연결이 필요하다

- **[공공 오픈소스SW 거버넌스 가이드 2025 개정판](https://www.oss.kr/pages/12/4246)** (NIPA·Open UP):
  정보화사업의 기획→계약→수행→운영→성과평가 단계별 오픈소스 관리 절차와,
  **사업유형별 제안요청서(RFP) 오픈소스 요구사항 작성예시**까지 이미 존재한다.
  본 보고서 제언 3(용역 계약 표준조항)은 무에서 만드는 것이 아니라 — 이 가이드에
  "산출물의 공공 깃랩 등록·라이선스 명시·정부 내 공유 권리" 조항을 추가하고
  **권고를 계약 요건으로 격상**하는 문제다.
- **오픈소스 포털(oss.kr)·Open UP**: 라이선스 검증, 컨트리뷰션 아카데미, 개발자대회 등
  OSPO의 교육·컴플라이언스 기능 상당수를 이미 수행 중이다. 문제는 이 체계(과기정통부·NIPA)와
  공공 깃랩(행안부)이 **분리되어 있다는 것** — 제언 4의 정부 OSPO는 신설이 아니라
  **두 부처 자산의 연결**로 재정의한다.
- **ETRI 범출연연 오픈소스 협의체** 확대(2026.7): 연구기관 블록에서도 조직 단위 오픈소스
  거버넌스가 형성되고 있다 — 공공 깃랩 OSPO 네트워크의 예비 노드들이다.

### 국제 규범의 최신 좌표 (2026)

- **[EU 기술주권 패키지(2026.6.3)](https://www.oss.kr/pages/11/4600)**: 오픈소스가 개발자 지원책이
  아니라 반도체법 2.0·클라우드AI개발법(CADA)과 나란한 **기술 주권 전략의 한 축**이 됐다.
  실행 과제에 본 보고서의 제언과 정확히 겹치는 항목들이 있다 — **공공부문 OSPO 네트워크**,
  오픈소스 친화 조달 가이드라인, 핵심 자산 스튜어드십 툴킷, **유지관리 재원(Open Source
  Maintenance Instrument)**, 그리고 유럽 오픈소스의 해외 진출을 지원하는 EU Tech Business Offer
  (전략 보고서 v2의 수출 카탈로그 제안과 동형). 동시에 Tech Policy Press는 "7년 20억 유로로
  연 2,600억 유로의 의존을 풀 수 없다 — 성패는 실행 규범"이라 지적했다: **전략 선언이 아니라
  조달·유지보수·인력의 실행 설계가 관건**이라는 교훈은 한국에도 그대로 적용된다.
- **[G7 AI 개방성 원칙·OECD 분석](https://www.oss.kr/pages/11/4606)**: OECD는 글로벌 오픈소스
  기여 10% 증가가 장기 GDP 약 0.5% 증가(약 1조 달러 규모)와 연관된다고 추정했다 — 공공 코드
  개방은 투명성 의제이자 **경제 정책**이다. G7은 AI 개방성을 4단계 스펙트럼으로 정의했는데,
  이는 공공 깃랩 저장소에도 적용 가능한 문법이다(코드만 공개 / 가중치 공개 / 데이터·과정 공개 …).
  같은 브리핑이 주목한 **AI-BOM**(모델·데이터·라이선스·의존관계 문서화)은 제언 7(SBOM)의
  확장형이다 — AI 도구가 대부분인 공공 깃랩에는 SBOM보다 AI-BOM이 정확한 요구다.
- **소버린 AI와의 접속** ([머브 히콕 칼럼](https://v.daum.net/v/uMIzjdEo1f), [SPRi RE-202](https://spri.kr/posts/view/23990?code=research&study_type=&board_type=&flg=1)):
  공공 자금으로 개발되는 한국 소버린 AI 모델은 오픈소스로 공개될 예정이며, SPRi는 오픈소스 AI
  활성화를 AI 경쟁력의 축으로 분석한다. oss.kr 기획기사의 한국 진단이 정곡이다 —
  **"모델을 여는 단계에서 스택 전체를 여는 단계로"**. 모델(독파모)은 열면서 그 모델로 만든
  공공 도구(깃랩의 코드)는 라이선스조차 없는 현재의 비대칭이, 공공 깃랩 개선이 소버린 AI
  전략의 일부인 이유다. 중국의 교훈도 같은 방향이다: 딥시크 이후 경쟁은 모델 공개가 아니라
  **모델+추론 인프라+칩 최적화를 묶어 여는 시스템 경쟁**으로 옮겨갔다.

### 문화·운영 관행의 참조점

- **[GitLab Foundation·OpenAI Demo Day의 네 가지 교훈](https://www.linkedin.com/pulse/building-roads-ai-public-sector-four-takeaways-from-amber-cnave/)** (미 공공 AI Hub 운영 경험):
  ① 가장 강력한 해법은 비기술 실무자에게서 나온다(케이스매니저·행정담당 — PAX의 실무자 주도
  54%와 동일 관찰) ② "말하지 말고 보여줘라" — 검증된 프롬프트·블루프린트를 미완성이라도 공유
  ③ **차가 아니라 길을 놓아라** — 단일 제품이 아닌, 기관들이 스스로 해법을 만들 인프라(교육·
  동료학습·실험 공간) ④ 성과만큼 **실패 공유와 역량 투자**에 재원을 대라. 공공 깃랩의 다음
  단계 설계 원칙으로 이보다 압축적인 문장은 없다 — 참고로 미국도 Code for America 조사 기준
  AI 준비 고급 단계 주정부가 3곳뿐이다: 한국의 격차 관측과 같은 그림이다.
- **[500+ AI Agents Projects](https://discuss.pytorch.kr/t/7621)**: 산업·프레임워크별 에이전트
  사례를 코드 링크와 함께 모은 글로벌 큐레이션 저장소 — "사례 아카이브 + 실행 가능한 코드"
  결합이 참조·재사용을 만든다는 방증이며, PAX 사례-저장소 연결과 공공 깃랩 카탈로그(제언 5)가
  지향할 형태다.

### 저장소를 넘어 — 스택·조달·데이터 계층의 시야 (2차 추가 조사)

- **싱가포르 SGTS가 보여주는 저장소의 목적지** ([NIA 디지털서비스 이슈리포트 2025-2](https://www.nia.or.kr/common/board/Download.do?bcIdx=28788&cbIdx=99863&fileNo=1)):
  싱가포르 정부기술청(GovTech)의 기술 스택(SGTS)은 저장소가 아니라 **정부 공통 개발·배포
  체계 전체**다 — GCC(보안 표준이 입혀진 민간 클라우드), **SHIP-HATS(정부 공통 CI/CD·자동화
  테스트)**, APEX(중앙 API 게이트웨이), NDI(통합 인증). 부처는 검증된 스택 위에서 만들기만
  하면 된다("중앙에서 검증하고, 부처는 활용한다"). 공공 깃랩의 다음 단계가 무엇이냐는 질문의
  답이 여기 있다: **코드를 올리는 곳에서, 코드가 서비스가 되는 곳으로** — CI/CD·테스트·배포
  파이프라인이 붙지 않으면 저장소는 아카이브에 머문다. 온AI 실험실에 대한 실사용 혹평
  ("개발 시스템이 직관적이지 않다")은 정확히 이 공백의 증상이다.
- **영국 Spend Controls — 재사용을 강제하는 조달 게이트** (같은 리포트): 영국은 10만 파운드
  이상 디지털 사업에 GDS 사전 검토·승인을 의무화해 중복 투자를 막고 표준 준수를 강제했다.
  이탈리아의 조달 전 재사용 평가(CAD 68·69조)와 같은 계열의 장치로, 제언 5(검증 카탈로그)가
  힘을 가지려면 **"카탈로그를 먼저 확인했는가"를 묻는 조달 게이트**가 필요하다는 근거다.
  NIA 리포트의 결론 — 한국은 영국(민간 개방)도 싱가포르(정부 통합)도 그대로 이식할 수 없고,
  국산 클라우드·모델 생태계를 활용하는 **하이브리드 제3 모델**이 필요하다 — 는 본 보고서의
  "연결" 제언과 같은 방향이다.
- **API 계층과 데이터 계층의 병행** ([API7: 디지털 정부 API 10대 모범 사례](https://api7.ai/ko/blog/api-digital-government-best-practices),
  [영국 NDL·GOV.UK AI 분석](https://zooey31.tistory.com/46)): 영국은 국가 API 전략으로 API를
  표준화된 공공 인터페이스로 관리하고, 싱가포르는 APEX 하나로 정부 API를 중앙 게이트웨이화했다.
  격차 지도의 레거시 연동 수요(새올·이호조·인사랑 API 부재)의 구조적 해법은 개별 우회 도구가
  아니라 이 **중앙 API 계층**이다. 영국이 1억 파운드 이상을 투입하는 National Data Library
  (공공데이터의 단일 신뢰 관문)는 코드 저장소와 짝을 이루는 **데이터 계층**의 설계다 —
  코드(깃랩)·API(게이트웨이)·데이터(단일 관문)의 삼중 스택이 갖춰질 때 개별 도구의 재사용이
  구조적으로 쉬워진다.

- **플랫폼 정부(GaaP) 이론이 주는 위치 감각** ([서형준, 「국내 디지털플랫폼정부 구현을 위한
  정책연구」, 정보화정책 30-4, 2023](https://www.nia.or.kr/common/board/Download.do?bcIdx=26215&cbIdx=65684&fileNo=1)):
  플랫폼 정부는 네 유형 — 통합시스템·데이터·소통·**협업생산** 플랫폼 — 으로 나뉘는데,
  내용분석 결과 한국 디지털플랫폼정부 정책은 **통합시스템 플랫폼에 편중**되어 있다.
  논문의 제언 셋(유형 균형, 외부 이해관계자의 능동적 참여·생태계 유인, 공공부문의
  재구조화 선행)은 본 보고서의 언어로 정확히 번역된다: 공공 깃랩은 한국 정책 지형에서
  드문 **협업생산 플랫폼**의 실물이며, "인프라만 짓고 이해관계자 유인·생태계 구축에 소홀한
  플랫폼은 실패한다"(van Alstyne)는 민간 플랫폼 전략의 교훈이 그대로 적용된다 —
  라이선스·기여 가이드·공개 경로 같은 생태계 장치 없이 저장소(인프라)만 있는 현재 상태가
  바로 그 실패 패턴의 입구다. 형식주의·부처 칸막이가 협업생산을 막는다는 지적은
  제언 4(부처 자산 연결)가 조직 문화 과제이기도 함을 상기시킨다.

## 4. 개선 제언 — 우선순위와 실행 주체

| # | 제언 | 근거 관측 | 벤치마크 | 비용 |
|---|---|---|---|---|
| 1 | **저장소 생성 시 라이선스 선택 필수화** (권장 기본값: MIT 또는 Apache-2.0, 공공누리 병행 안내) | 명시율 36% — 재사용 조건 없는 코드 2/3 | 기업 라이선스 게이트 | 극소 (플랫폼 설정) |
| 2 | **외부 공개(미러) 절차 표준화** — 내부 검증 후 GitHub 미러를 공식 경로로 문서화, "공개 ≠ 지원 약속" 명문화 | 개방율 18.4%, 미러 관행 자생 중 | 이너소스→오픈소스 2단계, 영국 coding in the open | 소 (지침 1건) |
| 3 | **용역 계약 표준조항** — 정부 발주 개발물의 소스·수정권 확보와 깃랩 등록 의무. NIPA 거버넌스 가이드의 RFP 예시에 조항 추가 후 계약 요건으로 격상 | 신규 개발물 다수가 깃랩 밖 | 미국 SHARE IT Act + **NIPA 가이드(기존 자산)** | 소 (조달 지침) |
| 4 | **정부 OSPO 기능 — 신설이 아니라 연결**: 행안부 AI실험실(플랫폼) × 과기정통부 NIPA·Open UP(라이선스 검증·교육) × 범출연연 협의체를 공공 OSPO 네트워크로 묶기 | 규칙 부재가 명시율·공개율의 원인, 부처 간 자산 분리 | 기업 OSPO, **EU 공공 OSPO 네트워크** | 중 (부처 협력) |
| 5 | **검증 카탈로그 분리 + 조달 게이트** — "타 기관 사용 검증" 카탈로그 구축, 일정 규모 이상 정보화 사업은 조달 전 카탈로그 재사용 검토를 의무화 | 재사용 신호 부재, 실험실 보드는 목록 수준 | 독일 openCoDE, 이탈리아 CAD 68·69, **영국 Spend Controls** | 중 |
| 6 | **"정부 내 공유 의무"의 제도화 검토** — 권고→훈령→법의 단계, 최종적으로 opt-out 공개 기본값 | 미국 8년 실패의 교훈 | SHARE IT Act, 스위스 EMBAG | 대 (입법) |
| 7 | **SBOM→AI-BOM 게이트** — 취약점 스캔에 더해 AI 도구의 모델·데이터·라이선스·의존관계 문서화(AI-BOM), KODA류 자생 도구의 공식 채택 검토 | 보안 우려가 공개 반대 논리로 사용됨, 깃랩 다수가 AI 도구 | OpenSSF, **G7·AI-BOM 논의** | 중 |
| 8½ | **공통 개발·배포 스택으로 확장** — 깃랩에 CI/CD·자동화 테스트·배포 파이프라인 결합(정부 공통 러너·템플릿), 장기적으로 중앙 API 게이트웨이·데이터 관문과 삼중 스택화 | 온AI 실험실 실사용 혹평 — 저장소만으로는 서비스가 안 됨 | **싱가포르 SGTS(SHIP-HATS·APEX)**, 영국 NDL | 대 (인프라) |
| 8 | **플랫폼 지표 공표** — 개방율·명시율·재사용·활성도를 분기 공개. 개방의 경제 효과(OECD: 기여 10%↑→GDP 0.5%↑)를 근거로 예산 논리화 | 자기 관측 부재 | CHAOSS류 지표, **OECD Benefits of AI Openness** | 소 |

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
한국 자산·국제 규범(추가 조사): [NIPA 공공 오픈소스SW 거버넌스 가이드 2025](https://www.oss.kr/pages/12/4246) · [EU 기술주권 패키지 기획기사(오픈소스 포털)](https://www.oss.kr/pages/11/4600) · [G7 AI 개방성·AI-BOM 브리핑(제469호)](https://www.oss.kr/pages/11/4606) · [SPRi RE-202 오픈소스AI 활성화 방안](https://spri.kr/posts/view/23990?code=research&study_type=&board_type=&flg=1) · [머브 히콕: 소버린AI와 한국의 SLM·오픈소스 전략](https://v.daum.net/v/uMIzjdEo1f) · [GitLab Foundation Demo Day 교훈](https://www.linkedin.com/pulse/building-roads-ai-public-sector-four-takeaways-from-amber-cnave/) · [500+ AI Agents Projects 소개](https://discuss.pytorch.kr/t/7621)
플랫폼 정부 이론: [서형준(2023) 플랫폼 정부 유형화 연구(정보화정책 30-4)](https://www.nia.or.kr/common/board/Download.do?bcIdx=26215&cbIdx=65684&fileNo=1)
스택·조달·데이터(2차 추가): [NIA 디지털서비스 이슈리포트 2025-2 — 영국 vs 싱가포르 인프라 전략](https://www.nia.or.kr/common/board/Download.do?bcIdx=28788&cbIdx=99863&fileNo=1) · [API7: 디지털 정부 API 10대 모범 사례](https://api7.ai/ko/blog/api-digital-government-best-practices) · [영국 NDL·GOV.UK AI 서비스 분석](https://zooey31.tistory.com/46)
한국 관측: PAX 공공 AX 지수 2026Q3 (hollobit.github.io/PAX/observatory.html)
