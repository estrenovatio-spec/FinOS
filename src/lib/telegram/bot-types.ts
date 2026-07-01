export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  title?: string;
  performer?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
