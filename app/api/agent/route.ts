import { runPipeline } from "@/lib/agents/pipeline";
import type { StreamEvent } from "@/lib/agents/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let bundle: unknown;
  try {
    const body = await request.json();
    bundle = body?.bundle ?? body;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!bundle || typeof bundle !== "object") {
    return Response.json({ error: "Expected a FHIR Bundle object." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await runPipeline(bundle, emit);
      } catch (error) {
        emit({
          type: "fatal",
          message: error instanceof Error ? error.message : "Pipeline failed.",
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
