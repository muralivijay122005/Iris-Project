// Voices offered for read-aloud and voice chat. Shared by client and server;
// `ttsVoice` is the Groq TTS voice, `browser` lists system voices to fall back
// to (by name fragment) when server speech is unavailable.
export interface VoiceOption {
  id: string;
  label: string;
  description: string;
  ttsVoice: string;
  browser: string[];
  pitch: number;
  rate: number;
}

export const VOICES: VoiceOption[] = [
  {
    id: "aurora",
    label: "Aurora",
    description: "Bright and friendly",
    ttsVoice: "autumn",
    browser: ["Google US English", "Microsoft Aria", "Microsoft Zira", "Samantha"],
    pitch: 1.05,
    rate: 1,
  },
  {
    id: "sage",
    label: "Sage",
    description: "Calm and measured",
    ttsVoice: "diana",
    browser: ["Google UK English Female", "Microsoft Sonia", "Microsoft Hazel", "Karen"],
    pitch: 1,
    rate: 0.95,
  },
  {
    id: "atlas",
    label: "Atlas",
    description: "Deep and steady",
    ttsVoice: "troy",
    browser: ["Google UK English Male", "Microsoft Guy", "Microsoft David", "Daniel"],
    pitch: 0.9,
    rate: 0.98,
  },
  {
    id: "juniper",
    label: "Juniper",
    description: "Warm and upbeat",
    ttsVoice: "hannah",
    browser: ["Microsoft Jenny", "Google US English Female", "Microsoft Susan", "Tessa"],
    pitch: 1.12,
    rate: 1.03,
  },
];

export const DEFAULT_VOICE = VOICES[0].id;

export function resolveVoice(id: string | null | undefined): VoiceOption {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}
