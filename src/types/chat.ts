export interface Attachment {
  name: string;
  size: number;
  type: string;
  // Whether text could be extracted for the model
  readable?: boolean;
  // Extracted text; only kept client-side for temporary chats
  content?: string;
  truncated?: boolean;
  // Local object URL for image previews in the current session
  previewUrl?: string;
}

export interface GeneratedImageRef {
  id: string;
  prompt: string;
  width: number;
  height: number;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  images?: GeneratedImageRef[];
  reasoning?: string;
  model?: string;
  interrupted?: boolean;
  createdAt?: string;
  // Client-only state
  id?: string;
  pending?: boolean;
  // Server-reported progress label (e.g. "Painting")
  status?: string;
  error?: string;
  memoriesAdded?: string[];
}

export interface ChatSummary {
  _id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  snippet?: string | null;
}

export interface Memory {
  _id: string;
  content: string;
  source: "auto" | "manual";
  createdAt: string;
}
