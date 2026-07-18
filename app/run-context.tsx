"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AGENTS, type AgentId } from "@/lib/agents/types";
import type { Gap, Letter, PathwayPlan, PatientContext, StreamEvent } from "@/lib/agents/types";

export type AgentState = "idle" | "running" | "done" | "error";

/**
 * The completed artifacts, split out because these are what the /clinician and
 * /parent routes read. Kept in sessionStorage so a refresh or a direct visit to
 * either route doesn't land on an empty page — sessionStorage never leaves the
 * tab, so no run is persisted server-side and nothing is shareable by URL.
 */
type RunArtifacts = {
  context: PatientContext | null;
  plan: PathwayPlan | null;
  gaps: Gap[];
  letters: Letter[];
  clinician: string;
  parent: string;
};

const EMPTY: RunArtifacts = {
  context: null,
  plan: null,
  gaps: [],
  letters: [],
  clinician: "",
  parent: "",
};

const STORAGE_KEY = "postdx.run";

type RunValue = RunArtifacts & {
  states: Record<AgentId, AgentState>;
  details: Partial<Record<AgentId, string>>;
  elapsed: Partial<Record<AgentId, number>>;
  running: boolean;
  error: string | null;
  hasRun: boolean;
  run: (bundleText: string) => Promise<void>;
  clearError: () => void;
};

const RunContext = createContext<RunValue | null>(null);

const idleStates = () =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "idle"])) as Record<AgentId, AgentState>;

export function RunProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [artifacts, setArtifacts] = useState<RunArtifacts>(EMPTY);
  const [states, setStates] = useState<Record<AgentId, AgentState>>(idleStates);
  const [details, setDetails] = useState<Partial<Record<AgentId, string>>>({});
  const [elapsed, setElapsed] = useState<Partial<Record<AgentId, number>>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const startedAt = useRef<Partial<Record<AgentId, number>>>({});

  // Rehydrate once on mount. Reading sessionStorage during render would
  // desync the server-rendered HTML, so it happens in an effect.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setArtifacts(JSON.parse(stored) as RunArtifacts);
    } catch {
      // Corrupt or unavailable storage is not worth failing the app over.
    }
    setHydrated(true);
  }, []);

  // Persist completed runs only — mid-stream writes would thrash storage on
  // every token for no benefit.
  useEffect(() => {
    if (!hydrated || running) return;
    if (!artifacts.context && !artifacts.clinician) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(artifacts));
    } catch {
      // Over quota — the in-memory copy still works for this navigation.
    }
  }, [artifacts, running, hydrated]);

  const handleEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case "agent_start":
        startedAt.current[event.agent] = performance.now();
        setStates((s) => ({ ...s, [event.agent]: "running" }));
        break;
      case "agent_done": {
        const began = startedAt.current[event.agent];
        if (began) setElapsed((e) => ({ ...e, [event.agent]: performance.now() - began }));
        setStates((s) => ({ ...s, [event.agent]: "done" }));
        if (event.detail) setDetails((d) => ({ ...d, [event.agent]: event.detail }));
        break;
      }
      case "agent_error":
        setStates((s) => ({ ...s, [event.agent]: "error" }));
        setDetails((d) => ({ ...d, [event.agent]: event.message }));
        break;
      case "parsed":
        setArtifacts((a) => ({ ...a, context: event.data }));
        break;
      case "pathway":
        setArtifacts((a) => ({ ...a, plan: event.data }));
        break;
      case "gaps":
        setArtifacts((a) => ({ ...a, gaps: event.data }));
        break;
      case "letter":
        setArtifacts((a) =>
          a.letters.some((l) => l.id === event.letter.id)
            ? a
            : { ...a, letters: [...a.letters, event.letter] },
        );
        break;
      case "delta":
        setArtifacts((a) =>
          event.pane === "clinician"
            ? { ...a, clinician: a.clinician + event.text }
            : { ...a, parent: a.parent + event.text },
        );
        break;
      case "fatal":
        setError(event.message);
        break;
    }
  }, []);

  const run = useCallback(
    async (bundleText: string) => {
      let bundle: unknown;
      try {
        bundle = JSON.parse(bundleText);
      } catch {
        setError("That isn't valid JSON. Paste a FHIR Bundle or drop a .json file.");
        return;
      }

      setArtifacts(EMPTY);
      setStates(idleStates());
      setDetails({});
      setElapsed({});
      startedAt.current = {};
      setError(null);
      setRunning(true);

      let failed = false;
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundle }),
        });

        if (!response.ok || !response.body) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          // Keep the trailing partial line buffered rather than parsing it.
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              handleEvent(JSON.parse(line) as StreamEvent);
            } catch {
              // A malformed line shouldn't kill the run.
            }
          }
        }
      } catch (err) {
        failed = true;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setRunning(false);
      }

      // Hand off to the packet once the pipeline lands. Nothing to show here
      // afterwards, and the clinician package is the first thing you'd open.
      if (!failed) router.push("/clinician");
    },
    [handleEvent, router],
  );

  const value = useMemo<RunValue>(
    () => ({
      ...artifacts,
      states,
      details,
      elapsed,
      running,
      error,
      hasRun: Boolean(artifacts.context || artifacts.clinician || artifacts.letters.length),
      run,
      clearError: () => setError(null),
    }),
    [artifacts, states, details, elapsed, running, error, run],
  );

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun(): RunValue {
  const value = useContext(RunContext);
  if (!value) throw new Error("useRun must be used inside <RunProvider>");
  return value;
}
