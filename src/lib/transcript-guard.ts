/** Ответы LLM/STT, когда аудио не дошло — не сохраняем как транзакцию */
const GARBAGE_PATTERNS: RegExp[] = [
  /прикреп/i,
  /аудиофайл/i,
  /пожалуйста.*(прикреп|загруз|отправ)/i,
  /ссылку\s+на\s+него/i,
  /attach.*audio/i,
  /please\s+attach/i,
  /upload.*audio/i,
  /provide.*audio/i,
  /audio\s+file/i,
  /не\s+(вижу|слышу|распознал|получил)/i,
  /cannot\s+(hear|transcribe|process)/i,
  /unable\s+to\s+transcribe/i,
  /no\s+audio/i,
  /загрузите.*аудио/i,
  /отправьте.*аудио/i,
  /нет\s+аудио/i,
  /without\s+an?\s+audio/i,
];

export function isGarbageTranscript(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return true;
  return GARBAGE_PATTERNS.some((re) => re.test(t));
}

export function cleanTranscript(text: string): string {
  const t = text.trim();
  if (!t || isGarbageTranscript(t)) return "";
  return t;
}
