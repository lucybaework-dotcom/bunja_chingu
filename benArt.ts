// 벤 교수님 그림 주소. 실제 사이트는 함께 배포된 파일을, 시연판(파일 하나짜리)은 그림을 글자로 담아 쓴다.
import { BEN_ART } from './ben-assets';

export const benUrl = (name: string) =>
  import.meta.env.MODE === 'demo' ? `data:image/webp;base64,${BEN_ART[name]}` : `./${name}`;

/** 처음 쓸 때 깜빡이지 않게 미리 받아 둔다 */
export function preloadBen() {
  for (const n of ['ben-normal.webp', 'ben-happy.webp', 'ben-think.webp', 'ben-surprise.webp', 'ben-lab.webp']) { const i = new Image(); i.src = benUrl(n); }
}
