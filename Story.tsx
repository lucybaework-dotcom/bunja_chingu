// 처음 여는 사람을 위한 비주얼 노벨식 도입부:
// 연구실 문 노크 → 문이 열리며 빛 → 벤 교수님과 대화(대학원? → 친구?) → 앱 소개 → 원소 찾기 질문 → 추천 원소 → 회원가입
import { useEffect, useRef, useState } from 'react';
import { ELEMENTS } from './elements';
import type { ElementId } from './molecules';
import { QUESTIONS, scoreQuiz } from './quiz';
import { usableElements } from './chemistry';
import { Atom } from './bits';
import { BenSprite, type BenMood } from './BenSprite';
import { elementColor } from './colors';
import { benUrl, preloadBen } from './benArt';

/** 원소별 "자네는 OO 같은 사람이구만~" */
const LIKE: Record<ElementId, string> = {
  H: '어디든 스며드는 연결자', C: '판을 짜는 설계자', N: '흔들리지 않는 바위', O: '주변을 끌어당기는 에너자이저',
  F: '의리 넘치는 불꽃', Na: '아낌없이 퍼 주는 햇살', K: '반응 빠른 분위기 메이커', P: '모두를 움직이는 점화 플러그',
  S: '개성 확실한 주인공', Cl: '기준이 또렷한 정리왕',
};

type Line = { who: string; text: string; mood?: BenMood; choices?: string[] };
const OPENING: Line[] = [
  { who: '???', text: '음? 누구인가… 들어오게~', mood: 'surprise' },
  { who: '벤 교수', text: '홍홍~ 나는 유기화학 연구실의 벤 교수일세.', mood: 'happy' },
  { who: '벤 교수', text: '그래 자네, 대학원에 오고 싶은가?', mood: 'normal', choices: ['아니오'] },
  { who: '벤 교수', text: '…그, 그렇구만. 그럼 친구라도 만들어 보는 건 어떤가?', mood: 'think', choices: ['좋아요'] },
  { who: '벤 교수', text: '홍홍~ 좋네! 몰링크에선 모두가 원소 하나가 된다네.', mood: 'happy' },
  { who: '벤 교수', text: '물(H₂O)처럼, 진짜 분자 모양대로 2~6명이 실험실에 모이는 거지.', mood: 'normal' },
  { who: '벤 교수', text: '실험실에서 이야기하고, 실제로 만나면 분자 카드를 받는다네~', mood: 'happy' },
  { who: '벤 교수', text: '자 그럼, 자네는 어떤 원소인가? 몇 가지만 물어보겠네.', mood: 'think' },
];
const REACT = ['홍홍~', '오호~', '그렇구만~', '좋아, 좋아~'];

const PENDING_KEY = 'mollink-pending-quiz';
const SEEN_KEY = 'mollink-story-seen';
export const savePendingQuiz = (a: Record<string, number>) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(a)); } catch { /* 무시 */ } };
export const readPendingQuiz = (): Record<string, number> | null => { try { const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
export const clearPendingQuiz = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* 무시 */ } };
export const storySeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } };
export const markStorySeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* 무시 */ } };

const reduce = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 글자가 한 자씩 나오는 대사 */
function useTypewriter(text: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduce()) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((k) => { if (k >= text.length) { clearInterval(t); return k; } return k + 1; }), 32);
    return () => clearInterval(t);
  }, [text]);
  return { shown: text.slice(0, n), done: n >= text.length, finish: () => setN(text.length) };
}

export default function Story({ onSignup, onLogin, onSkip }: { onSignup: (answers: Record<string, number>) => void; onLogin?: () => void; onSkip: () => void }) {
  const [scene, setScene] = useState<'door' | 'opening' | 'lab'>(reduce() ? 'lab' : 'door');
  const [knocks, setKnocks] = useState(0);
  useEffect(() => { preloadBen(); }, []);
  const [step, setStep] = useState(0); // OPENING 줄 → 질문들 → 결과
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const qIndex = step - OPENING.length;
  const inQuiz = qIndex >= 0 && qIndex < QUESTIONS.length;
  const result = qIndex >= QUESTIONS.length ? scoreQuiz(answers, usableElements()).recommended : null;

  let line: Line;
  if (step < OPENING.length) line = OPENING[step];
  else if (inQuiz) {
    const q = QUESTIONS[qIndex];
    line = { who: '벤 교수', text: `${qIndex > 0 && qIndex % 3 === 0 ? REACT[qIndex % REACT.length] + ' ' : ''}${q.text}…?`, mood: qIndex % 4 === 2 ? 'think' : 'normal', choices: q.options.map((o) => o.text) };
  } else line = { who: '벤 교수', text: `홍홍~ 자네는 ${LIKE[result!]} 같은 사람이구만~`, mood: 'happy' };

  const tw = useTypewriter(scene === 'lab' ? line.text : '');
  const knock = () => {
    if (scene !== 'door') return;
    const k = knocks + 1; setKnocks(k);
    if (k >= 2) { setTimeout(() => setScene('opening'), 700); setTimeout(() => setScene('lab'), 2100); }
  };
  const next = () => {
    if (!tw.done) { tw.finish(); return; }
    if (line.choices || result) return;
    setStep(step + 1);
  };
  const choose = (i: number) => {
    if (!tw.done) { tw.finish(); return; }
    if (inQuiz) setAnswers({ ...answers, [QUESTIONS[qIndex].id]: i });
    setStep(step + 1);
  };
  const skipRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`story scene-${scene}`} role="dialog" aria-label="몰링크 시작 이야기">
      <div className="story-top" ref={skipRef}>
        {onLogin && <button className="story-link" onClick={onLogin}>이미 계정이 있어요</button>}
        <button className="story-link" onClick={onSkip}>건너뛰기</button>
      </div>

      {scene !== 'lab' && (
        <div className="hall" onClick={knock}>
          <Door open={scene === 'opening'} />
          <p className="hall-hint" aria-live="polite">{knocks === 0 ? '문을 두드려 보세요' : knocks === 1 ? '똑똑…' : scene === 'door' ? '???: 들어오게~' : ''}</p>
          {knocks > 0 && <span key={knocks} className="knock-fx" aria-hidden="true">똑!</span>}
          {scene === 'opening' && <div className="flash" aria-hidden="true" />}
        </div>
      )}

      {scene === 'lab' && (
        <div className="lab" onClick={() => { if (!line.choices && !result) next(); }}>
          <LabBackdrop />
          <div className={`ben-stand${result ? ' small' : ''}`}><BenSprite mood={line.mood} /></div>
          {inQuiz && <div className="quiz-progress mono" aria-label={`${qIndex + 1}번째 질문, 모두 ${QUESTIONS.length}개`}>{qIndex + 1} / {QUESTIONS.length}</div>}
          {result && <ResultCard el={result} />}
          <div className="vn-box" onClick={(e) => { e.stopPropagation(); next(); }}>
            <span className="vn-name">{line.who}</span>
            <p className="vn-text">{tw.shown}{!tw.done && <span className="caret" aria-hidden="true" />}</p>
            {tw.done && !line.choices && !result && <span className="vn-more" aria-hidden="true">▼</span>}
          </div>
          {tw.done && line.choices && (
            <div className="vn-choices" onClick={(e) => e.stopPropagation()}>
              {line.choices.map((c, i) => <button key={c} className="vn-choice" onClick={() => choose(i)}>{c}</button>)}
            </div>
          )}
          {tw.done && result && (
            <div className="vn-choices" onClick={(e) => e.stopPropagation()}>
              <button className="vn-choice main" onClick={() => onSignup(answers)}>회원가입하고 시작하기</button>
              <button className="vn-choice ghost" onClick={() => { setAnswers({}); setStep(OPENING.length); }}>다시 해 볼래요</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({ el }: { el: ElementId }) {
  const e = ELEMENTS[el]; const c = elementColor(el);
  return (
    <div className="vn-result" style={{ ['--glow' as string]: c.bg }}>
      <span className="eyebrow">자네의 원소</span>
      <div className="vn-result-atom"><Atom el={el} size={84} /></div>
      <h2>{e.name} <span className="mono muted" style={{ fontSize: 18 }}>{e.symbol}</span></h2>
      <p className="small">{e.personality.split('.')[0]}.</p>
      <div className="row" style={{ gap: 6, justifyContent: 'center' }}>{e.strengths.slice(0, 2).map((x) => <span key={x} className="chip">{x}</span>)}</div>
    </div>
  );
}

function Door({ open }: { open: boolean }) {
  return (
    <div className="door-wrap">
      <div className="door-light" aria-hidden="true" />
      <svg className={`door${open ? ' open' : ''}`} viewBox="0 0 220 360" aria-label="벤 교수 연구실 문">
        <rect x="4" y="4" width="212" height="352" rx="6" fill="#9b6a43" stroke="#5c3a20" strokeWidth="6" />
        <rect x="28" y="34" width="164" height="110" rx="6" fill="#fff4d6" stroke="#5c3a20" strokeWidth="5" />
        <rect x="28" y="34" width="164" height="110" rx="6" fill="url(#frost)" />
        <defs><linearGradient id="frost" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".7" /><stop offset="1" stopColor="#ffe9a8" stopOpacity=".3" /></linearGradient></defs>
        <rect x="28" y="168" width="164" height="160" rx="6" fill="none" stroke="#7a4f2e" strokeWidth="4" />
        <rect x="50" y="186" width="120" height="44" rx="6" fill="#f3efe6" stroke="#5c3a20" strokeWidth="3" />
        <text x="110" y="205" textAnchor="middle" fontSize="15" fontWeight="700" fill="#3b3340">벤 교수 연구실</text>
        <text x="110" y="222" textAnchor="middle" fontSize="11" fill="#6a5f6e">유기화학 · 노크 환영</text>
        <circle cx="186" cy="262" r="9" fill="#e7c15a" stroke="#8a6a1c" strokeWidth="3" />
        <polygon points="110,62 128,72 128,94 110,104 92,94 92,72" fill="none" stroke="#c89a3a" strokeWidth="4" opacity=".7" />
        <circle cx="110" cy="83" r="9" fill="none" stroke="#c89a3a" strokeWidth="3" opacity=".7" />
      </svg>
    </div>
  );
}

function LabBackdrop() {
  return <img className="lab-bg" src={benUrl('ben-lab.webp')} alt="" draggable={false} />;
}
