// 벤 교수님: AI 원소 상담 캐릭터 (분자친구 오리지널). 표정만 바뀌는 단순한 SVG. 가운 주머니에 벤젠 고리 배지.
export const PROF = { name: '벤 교수님', title: '유기화학 연구실', full: '벤 교수님의 원소 연구실' };

export function Professor({ size = 44, mood = 'idle' }: { size?: number; mood?: 'idle' | 'think' | 'happy' }) {
  return (
    <svg className={`prof prof-${mood}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={PROF.name}>
      <circle cx="50" cy="50" r="49" fill="#e6f2f3" />
      {/* 가운과 넥타이 */}
      <path d="M14 100 Q16 74 50 70 Q84 74 86 100Z" fill="#ffffff" stroke="#c9d6da" strokeWidth="1.5" />
      <path d="M50 71 L42 100 M50 71 L58 100" stroke="#c9d6da" strokeWidth="1.5" fill="none" />
      <path d="M46 72 L54 72 L52 82 L50 86 L48 82Z" fill="#0f6e78" />
      {/* 가슴 주머니의 벤젠 고리 배지 */}
      <polygon points="70,82 74,84.3 74,88.9 70,91.2 66,88.9 66,84.3" fill="none" stroke="#0f6e78" strokeWidth="1.6" />
      <circle cx="70" cy="86.6" r="2" fill="none" stroke="#0f6e78" strokeWidth="1" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="45" rx="22" ry="25" fill="#f6d7bd" />
      <ellipse cx="44" cy="27" rx="6" ry="2.5" fill="#fff" opacity=".45" />
      <ellipse cx="27.5" cy="48" rx="3.5" ry="5" fill="#efc6a6" /><ellipse cx="72.5" cy="48" rx="3.5" ry="5" fill="#efc6a6" />
      {/* 정수리는 훤하고 옆머리만 부스스한 흰머리 */}
      <g fill="#f4f4f2" stroke="#d2d2cd" strokeWidth="1.2">
        <path d="M30 50 Q20 46 22 38 Q18 32 25 28 Q26 21 34 23 Q33 30 31 36 Q34 42 30 50Z" />
        <path d="M70 50 Q80 46 78 38 Q82 32 75 28 Q74 21 66 23 Q67 30 69 36 Q66 42 70 50Z" />
      </g>
      <path d="M44 23 Q47 15 52 21 M50 22 Q55 14 58 21" stroke="#d2d2cd" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {/* 눈썹 */}
      <path className="prof-brow" d={mood === 'think' ? 'M35 37 L44 35 M56 34 L65 37' : 'M35 36 Q39.5 33 44 35.5 M56 35.5 Q60.5 33 65 36'} stroke="#bdbdb8" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      {/* 동그란 안경 */}
      <circle cx="40" cy="45" r="7.5" fill="#ffffff" fillOpacity=".55" stroke="#3a4a52" strokeWidth="2.2" />
      <circle cx="60" cy="45" r="7.5" fill="#ffffff" fillOpacity=".55" stroke="#3a4a52" strokeWidth="2.2" />
      <path d="M47.5 45 L52.5 45" stroke="#3a4a52" strokeWidth="2.2" />
      {/* 눈 */}
      {mood === 'happy'
        ? <path d="M36.5 46 Q40 42.5 43.5 46 M56.5 46 Q60 42.5 63.5 46" stroke="#2b2b2b" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        : <g fill="#2b2b2b"><circle className="prof-eye" cx={mood === 'think' ? 42 : 40} cy={mood === 'think' ? 43.5 : 45.5} r="2.3" /><circle className="prof-eye" cx={mood === 'think' ? 62 : 60} cy={mood === 'think' ? 43.5 : 45.5} r="2.3" /></g>}
      {/* 콧수염과 입 */}
      <path d="M40 57 Q45 53.5 50 56.5 Q55 53.5 60 57 Q55 59.5 50 58 Q45 59.5 40 57Z" fill="#e4e4e0" stroke="#cfcfca" strokeWidth=".8" />
      {mood === 'happy' ? <path d="M44 61 Q50 67 56 61Z" fill="#b65d4a" /> : mood === 'think' ? <circle cx="52" cy="62" r="1.8" fill="#b65d4a" /> : <path d="M45 61.5 Q50 64.5 55 61.5" stroke="#b65d4a" strokeWidth="2" strokeLinecap="round" fill="none" />}
      <ellipse cx="34" cy="55" rx="3.5" ry="2" fill="#f2a99a" opacity=".45" /><ellipse cx="66" cy="55" rx="3.5" ry="2" fill="#f2a99a" opacity=".45" />
    </svg>
  );
}
