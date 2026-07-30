"use client";

import {
  Check,
  Copy,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const CATEGORIES = [
  "머신 외장",
  "트롤리·승강",
  "집게 기구",
  "물리 구현",
] as const;

type PartCategory = (typeof CATEGORIES)[number];

type Part = {
  id: number;
  category: PartCategory;
  name: string;
  english: string;
  aliases?: string[];
  description: string;
  phrase: string;
};

const PARTS: Part[] = [
  {
    id: 1,
    category: "머신 외장",
    name: "상단 간판",
    english: "Marquee",
    aliases: ["헤더", "사인 보드"],
    description: "머신 최상단에서 제품명과 조명을 표시하는 외장 패널입니다.",
    phrase: "상단 간판(Marquee)의 높이와 조명",
  },
  {
    id: 2,
    category: "머신 외장",
    name: "유리 인클로저",
    english: "Glass enclosure",
    aliases: ["4면 유리", "전시창", "강화유리"],
    description:
      "상품 공간을 둘러싼 네 면의 투명 유리입니다. 현재 머신은 모서리 기둥 없이 유리 면이 이어집니다.",
    phrase: "4면 유리 인클로저의 투명도와 이음부",
  },
  {
    id: 3,
    category: "머신 외장",
    name: "수평 유리 트림",
    english: "Horizontal glass trim",
    aliases: ["상하단 프레임", "가로 몰딩"],
    description:
      "유리의 위아래 가장자리를 잡는 가로 프레임입니다. 수직 기둥과는 다른 부품입니다.",
    phrase: "유리 상·하단의 수평 트림",
  },
  {
    id: 4,
    category: "머신 외장",
    name: "상품 적재대",
    english: "Prize deck",
    aliases: ["프라이즈 데크", "인형 바닥", "플레이필드"],
    description: "인형과 경품이 쌓이는 내부 바닥 면입니다.",
    phrase: "상품 적재대(Prize deck)의 높이와 재질",
  },
  {
    id: 5,
    category: "머신 외장",
    name: "출구 아크릴 가이드",
    english: "Prize chute acrylic guide",
    aliases: ["아크릴 벽", "출구 벽", "낙하구 가이드"],
    description:
      "집게가 놓은 상품을 낙하구 안으로 유도하는 투명 벽입니다. 실제 충돌도 담당합니다.",
    phrase: "출구 주위 아크릴 가이드의 높이와 색상",
  },
  {
    id: 6,
    category: "머신 외장",
    name: "내부 낙하구",
    english: "Drop chute",
    aliases: ["상품 투입구", "드롭 홀", "출구 구멍"],
    description: "집게가 상품을 떨어뜨리는 상품 적재대의 개구부입니다.",
    phrase: "내부 낙하구(Drop chute)의 너비와 위치",
  },
  {
    id: 7,
    category: "머신 외장",
    name: "상품 배출구",
    english: "Prize-out door",
    aliases: ["상품 수령구", "하단 출구"],
    description: "낙하한 상품을 사용자가 꺼내는 전면 하단의 문입니다.",
    phrase: "전면 상품 배출구의 크기와 위치",
  },
  {
    id: 8,
    category: "머신 외장",
    name: "조작 패널",
    english: "Control fascia",
    aliases: ["컨트롤 패시아", "컨트롤 데크"],
    description:
      "조이스틱, 버튼, 표시창과 결제 장치를 수용하는 전면 경사 패널입니다.",
    phrase: "조작 패널(Control fascia)의 각도와 배치",
  },
  {
    id: 9,
    category: "머신 외장",
    name: "조이스틱",
    english: "Joystick",
    description: "트롤리의 수평 이동 방향을 입력하는 8방향 조작 장치입니다.",
    phrase: "조이스틱의 위치와 8방향 조작",
  },
  {
    id: 10,
    category: "머신 외장",
    name: "작동 버튼",
    english: "Illuminated action button",
    aliases: ["발광 버튼", "드롭 버튼"],
    description: "집게 하강과 라운드 진행을 시작하는 조명식 버튼입니다.",
    phrase: "발광 작동 버튼의 크기와 상태",
  },
  {
    id: 11,
    category: "머신 외장",
    name: "하부 서비스 캐비닛",
    english: "Lower service cabinet",
    aliases: ["하부 몸체", "베이스 캐비닛"],
    description:
      "제어기와 전원부를 수납하고 상부 머신을 지지하는 하단 외장입니다.",
    phrase: "하부 서비스 캐비닛의 폭과 색상",
  },
  {
    id: 12,
    category: "머신 외장",
    name: "서비스 도어",
    english: "Service door",
    aliases: ["점검문", "전면 도어"],
    description: "정비를 위해 하부 캐비닛 내부에 접근하는 잠금식 문입니다.",
    phrase: "하부 서비스 도어와 잠금장치",
  },
  {
    id: 13,
    category: "트롤리·승강",
    name: "X축 레일",
    english: "X-axis rail",
    aliases: ["가로 레일", "브리지 레일"],
    description: "트롤리가 좌우로 이동하는 상부 수평 레일입니다.",
    phrase: "상부 X축 레일의 길이와 위치",
  },
  {
    id: 14,
    category: "트롤리·승강",
    name: "Z축 레일",
    english: "Z-axis rail",
    aliases: ["깊이 레일", "세로 레일"],
    description: "브리지 또는 트롤리가 전후로 이동하도록 안내하는 레일입니다.",
    phrase: "상부 Z축 레일의 전후 이동 범위",
  },
  {
    id: 38,
    category: "트롤리·승강",
    name: "브리지 주행 구동부",
    english: "Bridge travel drive",
    aliases: ["주행 기어모터", "Z축 구동부", "좌측 구동 박스"],
    description:
      "좌측 엔드 플레이트에 고정되어 고정 레일 위의 바퀴를 돌리는 기어드 모터입니다. 브리지 전체를 전후로 움직이는 동력원이며, 기어케이스 내측면이 캐리지의 좌측 기계적 끝단이기도 합니다.",
    phrase: "좌측 엔드 플레이트의 브리지 주행 구동부",
  },
  {
    id: 39,
    category: "트롤리·승강",
    name: "구동 출력 샤프트",
    english: "Drive output shaft",
    aliases: ["구동축", "구동륜 축"],
    description:
      "기어케이스 출력이 엔드 플레이트를 관통해 좌측 레일 바퀴 2개를 직접 돌리는 굵은 축입니다. 우측 두 바퀴의 얇은 유동 스터브 축과 지름으로 구분합니다.",
    phrase: "좌측 레일 바퀴를 돌리는 구동 출력 샤프트",
  },
  {
    id: 15,
    category: "트롤리·승강",
    name: "트롤리",
    english: "Trolley carriage",
    aliases: ["캐리지", "크레인 헤드"],
    description:
      "레일을 따라 이동하며 윈치와 와이어 출구를 운반하는 상부 이동체입니다.",
    phrase: "트롤리 캐리지의 위치와 이동 속도",
  },
  {
    id: 16,
    category: "트롤리·승강",
    name: "윈치 모터·드럼",
    english: "Winch motor and drum",
    aliases: ["권상 모터", "릴", "와이어 드럼"],
    description:
      "비신축 와이어를 감거나 풀어 집게의 수직 높이를 변경하는 장치입니다.",
    phrase: "윈치 모터와 드럼의 승강 속도",
  },
  {
    id: 17,
    category: "트롤리·승강",
    name: "와이어 출구 가이드",
    english: "Cable outlet guide",
    aliases: ["페어리드", "원통형 가이드", "출구 가이드"],
    description:
      "트롤리 아래에서 와이어가 빠져나오는 원통형 가이드입니다. 몸통 윗면과 충돌해 과도한 기울기를 제한합니다.",
    phrase: "와이어 출구 가이드 콜라이더의 너비와 충돌",
  },
  {
    id: 18,
    category: "트롤리·승강",
    name: "승강 와이어",
    english: "Hoist cable",
    aliases: ["메인 와이어", "로프"],
    description:
      "집게 전체 하중을 지지하는 비신축 케이블입니다. 길이는 바뀌지만 탄성 진동은 만들지 않습니다.",
    phrase: "비신축 승강 와이어의 길이와 진자 운동",
  },
  {
    id: 19,
    category: "트롤리·승강",
    name: "나선형 전원 케이블",
    english: "Coiled power cable",
    aliases: ["검정 케이블", "코일 케이블"],
    description:
      "집게 액추에이터에 전원을 공급하는 나선형 케이블입니다. 현재 구현에서는 렌더링 전용입니다.",
    phrase: "검정색 나선형 전원 케이블의 모양",
  },
  {
    id: 20,
    category: "트롤리·승강",
    name: "상부 체결점",
    english: "Upper suspension mount",
    aliases: ["와이어 체결점", "스위블", "행거"],
    description:
      "승강 와이어와 집게 몸통을 연결하는 상단 결합부입니다. 집게의 진자 운동 기준점입니다.",
    phrase: "와이어와 몸통 사이 상부 체결점",
  },
  {
    id: 21,
    category: "집게 기구",
    name: "집게 몸통",
    english: "Claw housing",
    aliases: ["솔레노이드 하우징", "본체", "원통형 하우징"],
    description:
      "플런저와 링크 기구를 수용하는 원통형 중심 몸체입니다. 집게 전체의 기준 강체입니다.",
    phrase: "집게 몸통(Claw housing)의 원통형 외장",
  },
  {
    id: 22,
    category: "집게 기구",
    name: "상부 캡",
    english: "Top cap",
    aliases: ["상부 덮개", "몸통 윗면"],
    description:
      "집게 몸통의 넓은 윗면입니다. 와이어 출구 가이드와 충돌해 기울기를 제한합니다.",
    phrase: "집게 몸통의 넓은 상부 캡 콜라이더",
  },
  {
    id: 23,
    category: "집게 기구",
    name: "플런저",
    english: "Plunger",
    aliases: ["중앙 플린저", "중앙 축", "슬라이더"],
    description:
      "몸통 중심에서 수직 이동하며 세 손가락을 동시에 펼치거나 닫는 유일한 구동 입력입니다.",
    phrase: "중앙 플런저의 수직 변위와 최대 축력",
  },
  {
    id: 24,
    category: "집게 기구",
    name: "직선 가이드",
    english: "Prismatic guide",
    aliases: ["가이드 부싱", "슬라이드 가이드"],
    description:
      "플런저가 몸통 중심축을 벗어나지 않고 위아래로만 이동하도록 안내합니다.",
    phrase: "플런저 직선 가이드의 축 정렬",
  },
  {
    id: 25,
    category: "집게 기구",
    name: "로커 링크",
    english: "Rocker link",
    aliases: ["링크 암", "레버 암", "직선 링크"],
    description:
      "몸통 피벗을 중심으로 회전하며 이동 손가락 힌지를 고정 반경의 원호로 안내하는 직선 부품입니다.",
    phrase: "몸통과 손가락 힌지를 잇는 로커 링크",
  },
  {
    id: 26,
    category: "집게 기구",
    name: "몸통 피벗",
    english: "Body pivot",
    aliases: ["고정 힌지", "상단 피벗", "로커 축"],
    description:
      "로커 링크의 상단을 몸통에 결합하는 고정 위치입니다. 이동 힌지·플런저 연결부와 같은 공통 힌지 핀 오브젝트를 사용합니다.",
    phrase: "집게 몸통과 로커 링크 사이의 몸통 피벗",
  },
  {
    id: 27,
    category: "집게 기구",
    name: "이동 손가락 힌지",
    english: "Moving finger hinge",
    aliases: ["하단 힌지", "손가락 힌지", "이동 피벗"],
    description:
      "로커 링크 하단과 곡선 손가락을 연결하는 위치입니다. 공통 힌지 핀을 사용하며 개폐 중 몸통에서 멀어지거나 가까워집니다.",
    phrase: "로커 링크와 곡선 손가락 사이의 이동 힌지",
  },
  {
    id: 28,
    category: "집게 기구",
    name: "곡선 손가락",
    english: "Curved claw finger",
    aliases: ["2단 곡률 손가락", "이중 굴곡 집게", "낫 형태 집게", "프롱"],
    description:
      "힌지 결합부의 첫 번째 각과 하단의 둥근 두 번째 굴곡을 가진 하나의 연속된 강체입니다. 별도 파지 패드 없이 손가락 표면 전체가 상품 접촉과 마찰을 담당합니다.",
    phrase: "두 번 꺾인 곡선 손가락의 형상과 표면 마찰",
  },
  {
    id: 29,
    category: "집게 기구",
    name: "플런저 연결 핀",
    english: "Plunger connection pin",
    aliases: ["내측 핀", "중앙 연결축"],
    description:
      "곡선 손가락의 안쪽 끝과 플런저를 결합하는 위치입니다. 다른 회전 결합부와 같은 공통 힌지 핀을 사용하고 한 축 회전만 허용합니다.",
    phrase: "곡선 손가락과 플런저 사이의 연결 핀",
  },
  {
    id: 30,
    category: "집게 기구",
    name: "와셔·부싱·스냅링",
    english: "Washer, bushing and retaining ring",
    aliases: ["고정 고리", "축 고정부품"],
    description:
      "핀의 축방향 이탈과 금속 간 직접 마찰을 줄이는 작은 고정부품입니다. 세로 장식 고리와 구분합니다.",
    phrase: "힌지 핀의 와셔·부싱·스냅링",
  },
  {
    id: 31,
    category: "물리 구현",
    name: "렌더 메시",
    english: "Render mesh",
    aliases: ["비주얼 메시", "보이는 모델"],
    description:
      "화면에 실제 부품처럼 보이는 상세 3D 형상입니다. 충돌 계산 형상과 분리할 수 있습니다.",
    phrase: "렌더 메시의 형상과 재질",
  },
  {
    id: 32,
    category: "물리 구현",
    name: "콜라이더",
    english: "Collider",
    aliases: ["충돌체", "물리 메시"],
    description:
      "충돌과 접촉을 계산하는 단순화된 보이지 않는 형상입니다. 디버그 모드에서만 선으로 확인합니다.",
    phrase: "손가락 콜라이더의 곡률과 접촉 범위",
  },
  {
    id: 33,
    category: "물리 구현",
    name: "강체",
    english: "RigidBody",
    aliases: ["리지드바디", "물리 바디"],
    description:
      "질량, 속도와 회전을 가지며 힘을 전달하는 물리 단위입니다.",
    phrase: "집게 몸통 RigidBody의 질량과 감쇠",
  },
  {
    id: 34,
    category: "물리 구현",
    name: "회전 조인트",
    english: "Revolute Joint",
    aliases: ["힌지 조인트", "1축 회전 결합"],
    description:
      "두 강체의 위치를 결합하고 지정한 한 축 회전만 허용합니다. 집게의 각 핀에 사용합니다.",
    phrase: "해당 결합부의 Revolute Joint 축 정렬",
  },
  {
    id: 35,
    category: "물리 구현",
    name: "직선 조인트",
    english: "Prismatic Joint",
    aliases: ["슬라이더 조인트", "1축 이동 결합"],
    description:
      "두 강체 사이에서 지정한 한 축의 직선 이동만 허용합니다. 몸통과 플런저 사이에 사용합니다.",
    phrase: "몸통과 플런저 사이의 Prismatic Joint",
  },
  {
    id: 36,
    category: "물리 구현",
    name: "로프 조인트",
    english: "Rope Joint",
    aliases: ["거리 구속", "비신축 와이어 구속"],
    description:
      "체결점 사이 최대 거리를 제한해 비신축 승강 와이어의 진자 운동을 만듭니다.",
    phrase: "승강 와이어 Rope Joint의 길이 구속",
  },
  {
    id: 37,
    category: "물리 구현",
    name: "폐쇄 링크",
    english: "Closed-loop linkage",
    aliases: ["폐루프 링크", "4절 링크"],
    description:
      "몸통→로커→손가락→플런저→몸통이 다시 연결되는 기구입니다. 접촉력이 모든 부품으로 전달됩니다.",
    phrase: "집게의 폐쇄 링크 구속과 연결 오차",
  },
];

function NumberBadge({ value }: { value: number }) {
  return <span className="part-number">{String(value).padStart(2, "0")}</span>;
}

function MachineDiagram() {
  return (
    <svg
      className="parts-diagram"
      viewBox="0 0 620 430"
      role="img"
      aria-labelledby="machine-diagram-title"
    >
      <title id="machine-diagram-title">인형 뽑기 머신 외장과 승강부 번호 도식</title>
      <defs>
        <linearGradient id="glass-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9f2ee" stopOpacity=".5" />
          <stop offset="1" stopColor="#96cfc6" stopOpacity=".12" />
        </linearGradient>
        <marker id="arrow-machine" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <path d="M0 0 7 3.5 0 7Z" fill="#756f65" />
        </marker>
      </defs>

      <rect x="176" y="24" width="268" height="55" rx="8" className="diagram-dark" />
      <text x="310" y="58" textAnchor="middle" className="diagram-logo">TOYS POP</text>
      <rect x="188" y="84" width="244" height="214" rx="3" fill="url(#glass-fill)" className="diagram-line" />
      <line x1="188" y1="84" x2="432" y2="84" className="diagram-heavy" />
      <line x1="188" y1="298" x2="432" y2="298" className="diagram-heavy" />
      <line x1="188" y1="245" x2="432" y2="245" className="diagram-deck" />
      <rect x="176" y="300" width="268" height="44" rx="3" className="diagram-accent" />
      <rect x="188" y="344" width="244" height="72" rx="3" className="diagram-body" />
      <rect x="348" y="357" width="58" height="38" rx="5" className="diagram-dark" />
      <path d="M238 243v-43h69v43M238 200h69" className="diagram-acrylic" />
      <rect x="252" y="207" width="42" height="34" rx="2" className="diagram-hole" />

      <line x1="218" y1="105" x2="401" y2="105" className="diagram-rail" />
      <line x1="282" y1="96" x2="282" y2="124" className="diagram-rail" />
      {/* Travel drive on the left end of the bridge, and the carriage inboard. */}
      <rect x="220" y="93" width="28" height="24" rx="4" className="diagram-dark" />
      <rect x="228" y="117" width="12" height="14" rx="3" className="diagram-metal" />
      <rect x="300" y="93" width="42" height="24" rx="5" className="diagram-dark" />
      <line x1="321" y1="117" x2="321" y2="165" className="diagram-cable" />
      <rect x="306" y="165" width="30" height="38" rx="7" className="diagram-metal" />
      <path d="M309 199q-20 34-7 40M321 202v40M333 199q20 34 7 40" className="diagram-finger" />
      <circle cx="231" cy="319" r="9" className="diagram-joystick" />
      <line x1="231" y1="319" x2="225" y2="302" className="diagram-heavy" />
      <circle cx="362" cy="318" r="10" className="diagram-button" />

      {[
        [1, 142, 47, 176, 47],
        [2, 488, 143, 432, 143],
        [3, 490, 283, 432, 298],
        [4, 488, 235, 432, 245],
        [5, 128, 205, 238, 205],
        [6, 132, 250, 252, 227],
        [7, 486, 376, 406, 376],
        [8, 126, 320, 176, 320],
        [13, 124, 105, 270, 105],
        [38, 124, 68, 224, 93],
        [15, 384, 116, 342, 106],
        [17, 384, 146, 321, 121],
        [18, 382, 166, 321, 151],
      ].map(([number, x, y, tx, ty]) => (
        <g key={number}>
          <line x1={x} y1={y} x2={tx} y2={ty} className="diagram-callout" markerEnd="url(#arrow-machine)" />
          <circle cx={x} cy={y} r="15" className="diagram-number-circle" />
          <text x={x} y={y + 4} textAnchor="middle" className="diagram-number-text">
            {String(number).padStart(2, "0")}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ClawDiagram() {
  return (
    <svg
      className="parts-diagram"
      viewBox="0 0 620 430"
      role="img"
      aria-labelledby="claw-diagram-title"
    >
      <title id="claw-diagram-title">집게 폐쇄 링크 기구 번호 도식</title>
      <defs>
        <linearGradient id="metal-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8f8f6" />
          <stop offset=".45" stopColor="#8c918f" />
          <stop offset=".7" stopColor="#fbfbf8" />
          <stop offset="1" stopColor="#585d5b" />
        </linearGradient>
        <marker id="arrow-claw" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <path d="M0 0 7 3.5 0 7Z" fill="#756f65" />
        </marker>
      </defs>

      <line x1="310" y1="16" x2="310" y2="78" className="diagram-cable thick" />
      <ellipse cx="310" cy="81" rx="46" ry="13" fill="url(#metal-fill)" className="diagram-line" />
      <rect x="264" y="81" width="92" height="107" rx="16" fill="url(#metal-fill)" className="diagram-line" />
      <ellipse cx="310" cy="188" rx="46" ry="13" fill="url(#metal-fill)" className="diagram-line" />
      <rect x="301" y="110" width="18" height="154" rx="8" className="diagram-plunger" />
      <rect x="291" y="247" width="38" height="22" rx="5" className="diagram-plunger" />

      <circle cx="276" cy="123" r="8" className="diagram-pin" />
      <circle cx="344" cy="123" r="8" className="diagram-pin" />
      <line x1="276" y1="123" x2="249" y2="204" className="diagram-link" />
      <line x1="344" y1="123" x2="371" y2="204" className="diagram-link" />
      <circle cx="249" cy="204" r="9" className="diagram-pin" />
      <circle cx="371" cy="204" r="9" className="diagram-pin" />

      <path
        d="M302 258 L249 204 L219 242 C193 275 192 301 214 340 L236 379"
        className="diagram-claw-metal"
      />
      <path
        d="M318 258 L371 204 L401 242 C427 275 428 301 406 340 L384 379"
        className="diagram-claw-metal"
      />
      <circle cx="302" cy="258" r="7" className="diagram-pin" />
      <circle cx="318" cy="258" r="7" className="diagram-pin" />

      {[
        [18, 163, 38, 310, 38],
        [20, 454, 73, 336, 81],
        [21, 468, 124, 356, 124],
        [22, 161, 82, 264, 81],
        [23, 466, 174, 319, 174],
        [25, 157, 154, 265, 154],
        [26, 158, 119, 276, 123],
        [27, 144, 208, 249, 204],
        [28, 469, 292, 430, 300],
        [29, 468, 248, 318, 258],
      ].map(([number, x, y, tx, ty]) => (
        <g key={number}>
          <line x1={x} y1={y} x2={tx} y2={ty} className="diagram-callout" markerEnd="url(#arrow-claw)" />
          <circle cx={x} cy={y} r="15" className="diagram-number-circle" />
          <text x={x} y={y + 4} textAnchor="middle" className="diagram-number-text">
            {String(number).padStart(2, "0")}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function PartsGlossaryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PartCategory | "전체">("전체");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  const filteredParts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return PARTS.filter((part) => {
      if (category !== "전체" && part.category !== category) return false;
      if (!normalized) return true;
      return [
        part.name,
        part.english,
        part.category,
        part.description,
        part.phrase,
        ...(part.aliases ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase("ko")
        .includes(normalized);
    });
  }, [category, query]);

  async function copyPhrase(part: Part) {
    const text = `“${part.phrase}” 부분을 수정해줘.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(part.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopiedId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="parts-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="parts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parts-modal-title"
      >
        <header className="parts-modal-header">
        <div className="brand parts-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <div>
            <strong>부품 용어집</strong>
            <span>PARTS IDENTIFICATION GUIDE</span>
          </div>
        </div>
          <div className="parts-modal-header-actions">
            <span className="parts-header-count">{PARTS.length} PARTS</span>
            <button
              type="button"
              className="parts-modal-close"
              onClick={onClose}
              aria-label="부품 용어집 닫기"
              autoFocus
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="parts-modal-scroll">
          <section className="parts-content">
        <div className="parts-hero">
          <div>
            <span className="eyebrow">MACHINE 01 · VISUAL GLOSSARY</span>
            <h1 id="parts-modal-title">인형 뽑기 머신<br />부품 용어집</h1>
          </div>
          <div className="parts-hero-copy">
            <p>
              번호로 위치를 확인하고, 카드에서 정확한 명칭을 찾으세요.
              에이전트에게 말할 때는 <strong>대화용 표현 복사</strong>를 누르면
              부품과 위치가 함께 전달됩니다.
            </p>
            <p className="parts-tip">
              예: “집게 몸통과 로커 링크 사이의 몸통 피벗” 부분을 수정해줘.
            </p>
          </div>
        </div>

        <section className="parts-diagram-grid" aria-label="부품 위치 도식">
          <article className="parts-diagram-card">
            <div className="parts-section-heading">
              <span>DIAGRAM A</span>
              <div>
                <h2>머신 전체</h2>
                <p>외장 · 트롤리 · 승강 장치</p>
              </div>
            </div>
            <MachineDiagram />
          </article>
          <article className="parts-diagram-card">
            <div className="parts-section-heading">
              <span>DIAGRAM B</span>
              <div>
                <h2>집게 확대</h2>
                <p>몸통 · 플런저 · 폐쇄 링크</p>
              </div>
            </div>
            <ClawDiagram />
          </article>
        </section>

        <section className="parts-catalog" aria-labelledby="parts-catalog-title">
          <div className="parts-catalog-heading">
            <div>
              <span className="eyebrow">INDEX / SEARCH</span>
              <h2 id="parts-catalog-title">부품 이름 찾기</h2>
            </div>
            <span>{filteredParts.length}개 표시</span>
          </div>

          <div className="parts-tools">
            <label className="parts-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">부품 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름, 영문명, 별칭 또는 역할 검색"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기">
                  <X size={16} />
                </button>
              )}
            </label>

            <div className="parts-category-list" aria-label="부품 분류">
              {(["전체", ...CATEGORIES] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {filteredParts.length > 0 ? (
            <div className="parts-card-grid">
              {filteredParts.map((part) => (
                <article className="part-card" key={part.id}>
                  <div className="part-card-topline">
                    <NumberBadge value={part.id} />
                    <span>{part.category}</span>
                  </div>
                  <h3>{part.name}</h3>
                  <p className="part-english">{part.english}</p>
                  {part.aliases && (
                    <p className="part-aliases">
                      <span>다른 이름</span>
                      {part.aliases.join(" · ")}
                    </p>
                  )}
                  <p className="part-description">{part.description}</p>
                  <div className="part-phrase">
                    <span>대화할 때</span>
                    <p>“{part.phrase}”</p>
                  </div>
                  <button
                    type="button"
                    className={copiedId === part.id ? "part-copy copied" : "part-copy"}
                    onClick={() => copyPhrase(part)}
                  >
                    {copiedId === part.id ? <Check size={15} /> : <Copy size={15} />}
                    {copiedId === part.id ? "복사됨" : "대화용 표현 복사"}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="parts-empty">
              <strong>일치하는 부품이 없습니다.</strong>
              <p>검색어를 줄이거나 다른 분류를 선택해 보세요.</p>
              <button type="button" onClick={() => { setQuery(""); setCategory("전체"); }}>
                전체 부품 보기
              </button>
            </div>
          )}
        </section>

        <aside className="parts-language-note">
          <span>명칭 원칙</span>
          <p>
            이 페이지는 프로젝트 문서와 코드에서 사용하는 명칭을 우선합니다.
            특히 <strong>로커 링크 = 링크 암 = 레버 암</strong>은 같은 부품이며,
            문서와 대화에서는 “로커 링크”로 통일합니다.
          </p>
        </aside>
          </section>
        </div>
      </section>
    </div>
  );
}
