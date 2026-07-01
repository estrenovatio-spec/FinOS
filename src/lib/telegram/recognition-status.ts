import {
  formatRecognitionStatus,
  nextRecognitionPhrase,
  RECOGNITION_PHRASE_MIN_MS,
  sleep,
} from "@/lib/recognition-phrases";
import { editMessageText, sendMessage } from "@/lib/telegram/bot-api";

const ROTATE_CHECK_MS = 400;

export class RecognitionStatusDisplay {
  private phraseShownAt = 0;
  private rotateTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private chatId: number,
    private statusMsgIdRef: { current: number | null },
    private phraseUserKey: string,
  ) {}

  async start(): Promise<void> {
    const phrase = nextRecognitionPhrase(this.phraseUserKey);
    this.phraseShownAt = Date.now();
    const msg = await sendMessage(this.chatId, formatRecognitionStatus(phrase));
    this.statusMsgIdRef.current = msg.message_id;
    this.rotateTimer = setInterval(() => {
      void this.maybeRotate();
    }, ROTATE_CHECK_MS);
  }

  private async maybeRotate(): Promise<void> {
    if (this.stopped || !this.statusMsgIdRef.current) return;
    if (Date.now() - this.phraseShownAt < RECOGNITION_PHRASE_MIN_MS) return;

    const phrase = nextRecognitionPhrase(this.phraseUserKey);
    this.phraseShownAt = Date.now();
    try {
      await editMessageText(
        this.chatId,
        this.statusMsgIdRef.current,
        formatRecognitionStatus(phrase),
      );
    } catch {
      /* ignore edit races */
    }
  }

  async finishBeforeResult(): Promise<void> {
    this.stop();
    const wait = RECOGNITION_PHRASE_MIN_MS - (Date.now() - this.phraseShownAt);
    if (wait > 0) await sleep(wait);
  }

  stop(): void {
    this.stopped = true;
    if (this.rotateTimer) {
      clearInterval(this.rotateTimer);
      this.rotateTimer = null;
    }
  }
}
