// Supabase 연결 정보. publishable 키는 공개용이라 코드에 들어가도 괜찮다 (secret 키는 절대 넣지 말 것).
export const SUPABASE_URL = 'https://hojfxegzanfpwfhwulri.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rUgLOxi3FOTshRE25OXfZg_aL3XNRym';
export const FUNCTION_NAME = 'bunja';
/** 알림 보내기용 공개키 (VAPID). 짝이 되는 비밀키는 Supabase 비밀값 VAPID_PRIVATE_JWK에만 둔다 */
export const VAPID_PUBLIC_KEY = 'BFJ7tMPPeDFjqoNEMrWlQXCUPAwDskfwgVPLjHeqJwiauAlZEmytbp1TPZe6QrdgtJsITavLF78EP7GeYgY3TAk';
