// 한국어 조사 자동 선택. 단어의 마지막 한글 글자의 받침으로 고른다 ("물(H₂O)"처럼 괄호가 붙어도 '물' 기준).
export type Josa = '이/가' | '을/를' | '은/는' | '과/와' | '으로/로' | '이에요/예요';

function lastHangulCode(word: string): number | null {
  for (let i = word.length - 1; i >= 0; i--) {
    const c = word.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) return c - 0xac00;
  }
  return null;
}

/** 조사만 반환 */
export function josaOf(word: string, kind: Josa): string {
  const code = lastHangulCode(word);
  const jong = code === null ? 0 : code % 28; // 0이면 받침 없음, 8이면 ㄹ
  const [withB, withoutB] = kind.split('/');
  if (kind === '으로/로') return jong === 0 || jong === 8 ? '로' : '으로';
  return jong === 0 ? withoutB : withB;
}

/** 단어 + 알맞은 조사 */
export const j = (word: string, kind: Josa) => word + josaOf(word, kind);
