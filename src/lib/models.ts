// AI models offered in the model picker. Shared by client and server; the
// server only accepts ids from this list.
export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "openai/gpt-oss-20b",
    label: "Iris Swift",
    description: "Fast answers for everyday tasks",
  },
  {
    id: "openai/gpt-oss-120b",
    label: "Iris Pro",
    description: "Deeper reasoning for complex problems",
  },
  {
    id: "qwen/qwen3.8-27b",
    label: "Qwen 3.8",
    description: "Strong at code and multilingual text",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

// Small, cheap model for background jobs (titles, memory extraction)
export const UTILITY_MODEL = "openai/gpt-oss-20b";

export function resolveModel(id: string | null | undefined): string {
  return MODELS.some((m) => m.id === id) ? (id as string) : DEFAULT_MODEL;
}

export function modelLabel(id: string | null | undefined): string {
  return MODELS.find((m) => m.id === id)?.label ?? "Iris";
}
