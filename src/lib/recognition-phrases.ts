import data from "@/lib/recognition-phrases-data.json";

export const RECOGNITION_PHRASE_MIN_MS = 3000;

const CATEGORY_KEYS = ["financial", "ai", "friendly", "short", "creative", "legacy"] as const;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Перемешиваем каждую категорию и собираем очередь, чередуя случайные категории. */
function buildShuffledQueue(): string[] {
  const seen = new Set<string>();
  const stacks = CATEGORY_KEYS.map((key) => {
    const unique = (data[key] as string[]).filter((phrase) => {
      if (seen.has(phrase)) return false;
      seen.add(phrase);
      return true;
    });
    return shuffle(unique);
  });

  const queue: string[] = [];
  while (stacks.some((stack) => stack.length > 0)) {
    const available = stacks.filter((stack) => stack.length > 0);
    const pick = available[Math.floor(Math.random() * available.length)]!;
    queue.push(pick.pop()!);
  }
  return queue;
}

const userQueues = new Map<string, string[]>();

export function recognitionPhraseUserKey(telegramUserId: number): string {
  return `tg:${telegramUserId}`;
}

export function nextRecognitionPhrase(userKey: string): string {
  let queue = userQueues.get(userKey);
  if (!queue?.length) {
    queue = buildShuffledQueue();
    userQueues.set(userKey, queue);
  }
  return queue.shift()!;
}

export function formatRecognitionStatus(phrase: string): string {
  return `🎙 ${phrase}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
