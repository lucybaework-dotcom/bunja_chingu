// 프로필 관심사, 반응도 칭찬 항목, 신고 사유 (편집용 콘텐츠)
export const INTEREST_TAGS = [
  '카페', '맛집', '산책', '운동', '헬스', '러닝', '보드게임', '노래방', '영화', '드라마', '음악', '공연',
  '전시', '독서', '공부', '코딩', '게임', '사진', '여행', '요리', '반려동물', '패션', '덕질', '봉사',
];
export const TAGS_MAX = 5;

export const PRAISE = [
  { id: 'kind', label: '친절해요' },
  { id: 'punctual', label: '시간 약속을 잘 지켜요' },
  { id: 'fun', label: '대화가 즐거워요' },
  { id: 'caring', label: '배려심이 깊어요' },
  { id: 'again', label: '또 만나고 싶어요' },
  { id: 'reply', label: '답장이 빨라요' },
] as const;
export const PRAISE_MAX = 3;

export const REPORT_REASONS = [
  { id: 'rude', label: '불쾌한 말이나 행동' },
  { id: 'noshow', label: '약속을 어기고 나타나지 않음' },
  { id: 'spam', label: '광고·홍보·스팸' },
  { id: 'inappropriate', label: '부적절한 요청 (연애·금전 등)' },
  { id: 'other', label: '기타' },
] as const;

/** 반응도: 50에서 시작. 받은 칭찬 1개당 +1, 확정된 신고 1건당 -5. 0~100 */
export const REACTION = { base: 50, perPraise: 1, perUpheldReport: -5, minReviewsToShow: 3 };

export const ADMIN_EMAILS = ['lucybae@kookmin.ac.kr'];
