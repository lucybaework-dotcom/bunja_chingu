// 벤 교수님: AI 원소 상담 캐릭터 (분자친구 오리지널). 표정만 바뀌는 단순한 SVG. 가운 주머니에 벤젠 고리 배지.
import { BenSprite } from './BenSprite';

export const PROF = { name: '벤 교수님', title: '유기화학 연구실', full: '벤 교수님의 원소 연구실' };

export function Professor({ size = 44, mood = 'idle' }: { size?: number; mood?: 'idle' | 'think' | 'happy' }) {
  // 큰 스탠딩 일러스트와 같은 얼굴을 동그랗게 잘라 쓴다
  return (
    <span className={`prof prof-${mood}`} style={{ width: size, height: size }} role="img" aria-label={PROF.name}>
      <BenSprite face mood={mood === 'idle' ? 'normal' : mood} />
    </span>
  );
}
