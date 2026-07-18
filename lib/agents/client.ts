import Anthropic from "@anthropic-ai/sdk";

/**
 * Model is pinned rather than read from env so a demo can't silently drift
 * onto a different tier mid-presentation.
 */
export const MODEL = "claude-sonnet-4-6";

let cached: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }
  cached ??= new Anthropic();
  return cached;
}

type CompleteOptions = {
  system: string;
  prompt: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
};

/** Single-shot text completion. Used for letters and structured extraction. */
export async function completeText({
  system,
  prompt,
  maxTokens = 4000,
  effort = "medium",
}: CompleteOptions): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { effort },
    messages: [{ role: "user", content: prompt }],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * Extracts a JSON value from a model response.
 *
 * Sonnet 4.6 does not support the structured-outputs `output_config.format`
 * parameter, so we prompt for JSON and parse defensively — tolerating code
 * fences and any surrounding prose rather than assuming a bare object.
 */
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();

  const firstObject = body.indexOf("{");
  const firstArray = body.indexOf("[");
  const candidates = [firstObject, firstArray].filter((i) => i !== -1);
  if (candidates.length === 0) {
    throw new Error(`No JSON found in model response: ${body.slice(0, 200)}`);
  }
  const start = Math.min(...candidates);
  const closer = body[start] === "{" ? "}" : "]";
  const end = body.lastIndexOf(closer);
  if (end <= start) {
    throw new Error(`Unterminated JSON in model response: ${body.slice(0, 200)}`);
  }

  return JSON.parse(body.slice(start, end + 1)) as T;
}

/** Text completion whose response is parsed as JSON. */
export async function completeJson<T>(options: CompleteOptions): Promise<T> {
  const text = await completeText(options);
  return parseJsonLoose<T>(text);
}

/** Streams a completion, invoking `onText` for each delta. */
export async function streamText(
  { system, prompt, maxTokens = 4000, effort = "medium" }: CompleteOptions,
  onText: (text: string) => void,
): Promise<string> {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { effort },
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onText(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  return final.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
