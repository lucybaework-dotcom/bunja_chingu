// 벤 교수님 스탠딩 일러스트 (비주얼 노벨 화면용). 흰 곱슬머리, 동그란 안경, 콧수염, 흰 가운, 넥타이, 분자 모형.
// 표정: normal(기본) · happy(웃음) · think(갸웃) · surprise(놀람). 눈은 가끔 깜빡인다.
import { benUrl } from './benArt';

export type BenMood = 'normal' | 'happy' | 'think' | 'surprise';

const SKIN = '#f8d9c0', SKIN_D = '#eab899', HAIR = '#fbfbf8', HAIR_S = '#d9dde3', LINE = '#3b3340';
const COAT = '#fdfdfb', COAT_S = '#dfe6ee', SHIRT = '#eef3f8', TIE = '#2d4a6b', TIE_S = '#1f3550';

export function BenSpriteDrawn({ mood = 'normal', className = '', face = false }: { mood?: BenMood; className?: string; face?: boolean }) {
  const happy = mood === 'happy';
  return (
    <svg className={`ben ben-${mood} ${className}`} viewBox={face ? '72 62 256 256' : '0 0 400 520'} role="img" aria-label={`벤 교수님 (${{ normal: '기본', happy: '웃음', think: '생각 중', surprise: '놀람' }[mood]})`}>
      <defs>
        <radialGradient id="ben-cheek" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ff9a9a" stopOpacity=".55" /><stop offset="1" stopColor="#ff9a9a" stopOpacity="0" /></radialGradient>
        <linearGradient id="ben-coat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={COAT} /><stop offset="1" stopColor={COAT_S} /></linearGradient>
        <radialGradient id="ben-c" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#6b6b6b" /><stop offset="1" stopColor="#151515" /></radialGradient>
        <radialGradient id="ben-h" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#c9d2da" /></radialGradient>
      </defs>
      <g className="ben-body">
        {/* 가운 몸통 */}
        <path d="M58 520 Q60 380 120 352 L200 336 L280 352 Q340 380 342 520Z" fill="url(#ben-coat)" stroke={LINE} strokeWidth="3" />
        {/* 셔츠·넥타이 */}
        <path d="M168 342 L200 420 L232 342 Z" fill={SHIRT} stroke={LINE} strokeWidth="2.5" />
        <path d="M190 352 L210 352 L214 366 L206 372 L218 452 L200 472 L182 452 L194 372 L186 366Z" fill={TIE} stroke={TIE_S} strokeWidth="2" />
        <path d="M196 380 L204 380" stroke="#4d6d92" strokeWidth="3" />
        {/* 깃 */}
        <path d="M168 342 L150 352 L178 420 L196 372Z" fill={COAT} stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M232 342 L250 352 L222 420 L204 372Z" fill={COAT} stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />
        {/* 주머니와 펜 */}
        <rect x="248" y="420" width="46" height="40" rx="6" fill="none" stroke={COAT_S} strokeWidth="2.5" />
        <rect x="262" y="404" width="5" height="24" rx="2" fill="#2b2b2b" /><rect x="272" y="408" width="5" height="20" rx="2" fill="#c0392b" />
        {/* 목 */}
        <path d="M178 300 L178 340 Q200 354 222 340 L222 300Z" fill={SKIN_D} />
      </g>
      {/* 머리 (살짝 흔들림) */}
      <g className="ben-head">
        {/* 뒤쪽 곱슬머리 */}
        <g fill={HAIR} stroke={HAIR_S} strokeWidth="2.5">
          <circle cx="112" cy="190" r="34" /><circle cx="100" cy="232" r="30" /><circle cx="114" cy="270" r="24" />
          <circle cx="288" cy="190" r="34" /><circle cx="300" cy="232" r="30" /><circle cx="286" cy="270" r="24" />
          <circle cx="132" cy="140" r="34" /><circle cx="268" cy="140" r="34" />
          <circle cx="170" cy="112" r="34" /><circle cx="230" cy="112" r="34" /><circle cx="200" cy="100" r="34" />
        </g>
        {/* 얼굴 */}
        <path d="M128 176 Q126 270 168 304 Q200 324 232 304 Q274 270 272 176 Q270 132 200 128 Q130 132 128 176Z" fill={SKIN} stroke={LINE} strokeWidth="3" />
        {/* 귀 */}
        <ellipse cx="126" cy="214" rx="12" ry="18" fill={SKIN} stroke={LINE} strokeWidth="2.5" /><ellipse cx="274" cy="214" rx="12" ry="18" fill={SKIN} stroke={LINE} strokeWidth="2.5" />
        {/* 앞머리 몇 가닥 */}
        <g fill={HAIR} stroke={HAIR_S} strokeWidth="2.5">
          <circle cx="150" cy="150" r="22" /><circle cx="250" cy="150" r="22" /><circle cx="186" cy="136" r="20" /><circle cx="216" cy="134" r="20" />
        </g>
        <path d="M186 150 Q196 164 192 172 M214 148 Q206 162 212 170" stroke={HAIR_S} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* 볼터치 */}
        <ellipse cx="152" cy="250" rx="20" ry="11" fill="url(#ben-cheek)" /><ellipse cx="248" cy="250" rx="20" ry="11" fill="url(#ben-cheek)" />
        {/* 눈썹 */}
        <g fill="#e9ebee" stroke="#b9bec6" strokeWidth="2.5" className="ben-brows">
          {mood === 'think'
            ? <><path d="M144 182 Q164 168 182 180 Q166 178 146 190Z" /><path d="M218 176 Q238 184 256 176 Q236 192 218 184Z" /></>
            : mood === 'surprise'
              ? <><path d="M144 172 Q164 156 184 168 Q164 166 146 180Z" /><path d="M216 168 Q236 156 256 172 Q236 166 218 180Z" /></>
              : <><path d="M144 182 Q164 166 184 178 Q164 176 146 190Z" /><path d="M216 178 Q236 166 256 182 Q236 176 218 190Z" /></>}
        </g>
        {/* 눈 */}
        <g className={happy ? '' : 'ben-eyes'}>
          {happy ? (
            <g stroke={LINE} strokeWidth="4.5" strokeLinecap="round" fill="none"><path d="M152 214 Q164 200 176 214" /><path d="M224 214 Q236 200 248 214" /></g>
          ) : (
            <g>
              {[164, 236].map((cx) => (
                <g key={cx}>
                  <ellipse cx={cx + (mood === 'think' ? 4 : 0)} cy={mood === 'think' ? 208 : 212} rx={mood === 'surprise' ? 13 : 12} ry={mood === 'surprise' ? 17 : 15} fill="#3a2a2a" />
                  <ellipse cx={cx + (mood === 'think' ? 4 : 0)} cy={(mood === 'think' ? 208 : 212) + 4} rx="8.5" ry="8.5" fill="#6b4a3a" />
                  <circle cx={cx - 3 + (mood === 'think' ? 4 : 0)} cy={(mood === 'think' ? 208 : 212) - 5} r="5" fill="#fff" />
                  <circle cx={cx + 4 + (mood === 'think' ? 4 : 0)} cy={(mood === 'think' ? 208 : 212) + 5} r="2" fill="#fff" />
                </g>
              ))}
            </g>
          )}
        </g>
        {/* 동그란 안경 */}
        <g fill="#ffffff" fillOpacity=".18" stroke="#1d1d22" strokeWidth="5">
          <circle cx="164" cy="212" r="25" /><circle cx="236" cy="212" r="25" />
        </g>
        <path d="M189 210 Q200 202 211 210" stroke="#1d1d22" strokeWidth="5" fill="none" />
        <path d="M139 208 L128 204 M261 208 L272 204" stroke="#1d1d22" strokeWidth="4" />
        <path d="M150 196 L158 190 M222 196 L230 190" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
        {/* 코 */}
        <path d="M200 228 Q196 244 204 246" stroke={SKIN_D} strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* 콧수염 */}
        <path d="M200 254 Q186 246 172 252 Q160 258 150 254 Q158 270 176 268 Q192 266 200 260 Q208 266 224 268 Q242 270 250 254 Q240 258 228 252 Q214 246 200 254Z" fill={HAIR} stroke={HAIR_S} strokeWidth="2.2" />
        {/* 입 */}
        {happy ? <path d="M184 272 Q200 296 216 272 Q200 280 184 272Z" fill="#b5524a" stroke={LINE} strokeWidth="2.5" />
          : mood === 'surprise' ? <ellipse cx="200" cy="280" rx="8" ry="10" fill="#b5524a" stroke={LINE} strokeWidth="2.5" />
            : mood === 'think' ? <path d="M190 280 Q200 276 212 282" stroke={LINE} strokeWidth="3" fill="none" strokeLinecap="round" />
              : <path d="M188 276 Q200 286 212 276" stroke={LINE} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {mood === 'think' && <text x="292" y="120" fontSize="40" fill="#5ab8f0" fontWeight="700">?</text>}
        {mood === 'surprise' && <g stroke="#f0a020" strokeWidth="5" strokeLinecap="round"><path d="M290 110 L300 90" /><path d="M306 122 L326 112" /></g>}
        {happy && <g fill="#ffd166"><path d="M300 100 l5 12 13 2 -10 8 3 13 -11 -7 -11 7 3 -13 -10 -8 13 -2Z" /></g>}
      </g>
      {/* 손과 분자 모형 (메테인 비슷한 공-막대) */}
      <g className="ben-model">
        <g stroke="#9aa3ab" strokeWidth="6" strokeLinecap="round">
          <path d="M170 446 L200 420 L232 440 M200 420 L196 388 M170 446 L148 432 M170 446 L166 474 M232 440 L256 428 M232 440 L238 468" />
        </g>
        <circle cx="200" cy="420" r="17" fill="url(#ben-c)" /><circle cx="170" cy="446" r="16" fill="url(#ben-c)" /><circle cx="232" cy="440" r="16" fill="url(#ben-c)" />
        {[[196, 386], [146, 430], [164, 476], [258, 426], [240, 470]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="11" fill="url(#ben-h)" stroke="#b9c3cc" strokeWidth="1.5" />)}
        {/* 손 */}
        <path d="M126 470 Q130 444 156 446 Q170 450 164 466 Q160 484 140 488 Q124 488 126 470Z" fill={SKIN} stroke={LINE} strokeWidth="3" />
        <path d="M274 466 Q272 442 248 446 Q234 452 240 468 Q246 484 264 486 Q278 484 274 466Z" fill={SKIN} stroke={LINE} strokeWidth="3" />
        <path d="M108 520 Q110 488 128 476 L150 490 Q138 504 140 520Z M292 520 Q290 488 272 474 L250 488 Q262 504 260 520Z" fill={COAT} stroke={LINE} strokeWidth="3" />
      </g>
    </svg>
  );
}

const MOODS: BenMood[] = ['normal', 'happy', 'think', 'surprise'];
/** 벤 교수님 일러스트 (그림 파일). 네 표정을 겹쳐 두고 지금 표정만 보여서 바꿀 때 깜빡이지 않는다 */
export function BenSprite({ mood = 'normal', className = '', face = false }: { mood?: BenMood; className?: string; face?: boolean }) {
  if (face) {
    const f = mood === 'surprise' ? 'normal' : mood;
    return <img className={`ben-face ${className}`} src={benUrl(`ben-face-${f}.webp`)} alt="" draggable={false} />;
  }
  return (
    <span className={`ben-art ben-${mood} ${className}`} role="img" aria-label={`벤 교수님 (${{ normal: '미소', happy: '웃음', think: '생각 중', surprise: '놀람' }[mood]})`}>
      {MOODS.map((m) => <img key={m} src={benUrl(`ben-${m}.webp`)} alt="" draggable={false} className={m === mood ? 'on' : ''} />)}
    </span>
  );
}
