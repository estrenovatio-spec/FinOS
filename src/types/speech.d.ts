interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex?: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData?: string;
  platform?: string;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  downloadFile?: (
    params: { url: string; file_name: string },
    callback?: (accepted: boolean) => void,
  ) => void;
  colorScheme?: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  onEvent?: (eventType: string, eventHandler: () => void) => void;
  viewportHeight: number;
  viewportStableHeight: number;
  initDataUnsafe: {
    user?: {
      first_name?: string;
      language_code?: string;
    };
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
