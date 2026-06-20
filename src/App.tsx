import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import type { OpenRouterTextModelOptions } from "@tanstack/ai-openrouter";
import { createMemo, createSignal, For, Show } from "solid-js";
import sampleStory from "../machine_stops.txt?raw";
import {
  availableActions,
  buildMachineStopsProject,
  compileDesign,
  createInitialState,
  extractJsonObject,
  parseProject,
  projectToJson,
  resolveAction,
  runPlaytest,
  summarizeAction,
  verifyGame,
  visibleHotspots,
  type Action,
  type AdventureDesign,
  type AdventureProject,
  type GameState,
  type Hotspot,
  type Verb,
  type WorldBible,
} from "./game";

type OpenRouterTextModel = Parameters<typeof createOpenRouterText>[0];
type TextReasoningEffort = "default" | "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
type Panel = "generate" | "design" | "play" | "playtest";

interface StreamChunk {
  type: string;
  delta?: string;
  message?: string;
  error?: unknown;
  usage?: unknown;
}

const appTitle = "Adventure Compiler";
const defaultModel = "moonshotai/kimi-k2.6";
const excerptLimit = 12000;

function textModelOptions(reasoningEffort: TextReasoningEffort): Partial<OpenRouterTextModelOptions> {
  if (reasoningEffort === "default") return {};
  return { reasoning: { effort: reasoningEffort } as OpenRouterTextModelOptions["reasoning"] };
}

function errorToText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function sourceExcerpt(source: string): string {
  if (source.length <= excerptLimit) return source;
  return `${source.slice(0, excerptLimit)}\n\n[Source excerpt truncated for this low-cost prototype request.]`;
}

async function streamTextJson(params: {
  apiKey: string;
  model: string;
  reasoningEffort: TextReasoningEffort;
  prompt: string;
  onStatus: (status: string) => void;
  onRaw: (raw: string) => void;
}): Promise<string> {
  const adapter = createOpenRouterText(params.model.trim() as OpenRouterTextModel, params.apiKey, {
    httpReferer: window.location.origin,
    appTitle,
  });

  const stream = chat({
    adapter,
    messages: [{ role: "user", content: params.prompt }],
    modelOptions: textModelOptions(params.reasoningEffort),
  }) as AsyncIterable<StreamChunk>;

  let text = "";
  const rawEvents: string[] = [];
  for await (const chunk of stream) {
    rawEvents.push(JSON.stringify(chunk, null, 2));
    params.onRaw(rawEvents.join("\n\n"));
    if (chunk.type === "TEXT_MESSAGE_CONTENT") {
      text += chunk.delta ?? "";
      params.onStatus("Streaming model response...");
    } else if (chunk.type === "RUN_ERROR") {
      throw new Error(chunk.message ?? errorToText(chunk.error));
    } else if (chunk.type === "RUN_FINISHED") {
      params.onStatus("Model response complete.");
    }
  }
  return text;
}

function worldBiblePrompt(source: string): string {
  return `Extract a world bible from this source for a small point-and-click adventure game.

Return only strict JSON matching this TypeScript shape:
{
  "title": string,
  "logline": string,
  "characters": [{"id": string, "name": string, "note": string}],
  "places": [{"id": string, "name": string, "note": string}],
  "objects": [{"id": string, "name": string, "note": string}],
  "factions": [{"id": string, "name": string, "note": string}],
  "motifs": string[],
  "tone": string[],
  "forbiddenContradictions": string[],
  "adventureHooks": string[]
}

Use short snake_case ids. Keep the result compact.

SOURCE:
${sourceExcerpt(source)}`;
}

function adventureDesignPrompt(source: string, bible: WorldBible): string {
  return `Generate a compact SCUMM-style point-and-click adventure design from this world bible.

Return only strict JSON matching this TypeScript shape:
{
  "premise": string,
  "player_role": string,
  "locations": [{"id": string, "name": string, "description": string, "exits": string[]}],
  "npcs": [{"id": string, "name": string, "location": string, "description": string, "dialogue": string[]}],
  "items": [{"id": string, "name": string, "location": string, "description": string, "portable": boolean}],
  "puzzles": [{
    "id": string,
    "name": string,
    "room": string,
    "goal": string,
    "requires_items": string[],
    "requires_flags": string[],
    "grants_items": string[],
    "sets_flags": string[],
    "clue": string
  }],
  "location_graph": [{"from": string, "to": string, "label": string}],
  "puzzle_dependency_graph": [{"from": string, "to": string, "label": string}],
  "win_conditions": string[],
  "fail_states": string[]
}

Constraints:
- Create 6 to 8 rooms, 5 to 8 items, 3 to 5 puzzles, and 2 to 4 NPCs.
- Every puzzle id must also be the target object for its USE rule.
- Every requires_items and grants_items id must appear in items.
- Put gated/granted-only items in location "inventory_cache" so they are not visible before puzzle effects grant them.
- Use one final win flag in win_conditions, and make the final puzzle set it.
- Make the graph solvable without random guessing.

WORLD BIBLE:
${JSON.stringify(bible, null, 2)}

SOURCE EXCERPT:
${sourceExcerpt(source)}`;
}

export default function App() {
  const [apiKey, setApiKey] = createSignal(localStorage.getItem("openrouter_api_key") ?? "");
  const [rememberKey, setRememberKey] = createSignal(Boolean(localStorage.getItem("openrouter_api_key")));
  const [model, setModel] = createSignal(defaultModel);
  const [reasoningEffort, setReasoningEffort] = createSignal<TextReasoningEffort>("default");
  const [sourceText, setSourceText] = createSignal(sampleStory);
  const [worldBible, setWorldBible] = createSignal<WorldBible | undefined>();
  const [project, setProject] = createSignal<AdventureProject | undefined>();
  const [projectJson, setProjectJson] = createSignal("");
  const [state, setState] = createSignal<GameState | undefined>();
  const [selectedVerb, setSelectedVerb] = createSignal<Verb>("look");
  const [selectedItem, setSelectedItem] = createSignal<string | undefined>();
  const [activePanel, setActivePanel] = createSignal<Panel>("generate");
  const [status, setStatus] = createSignal("Idle");
  const [error, setError] = createSignal("");
  const [rawResponse, setRawResponse] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [playtestLog, setPlaytestLog] = createSignal<string[]>([]);
  let projectImportInput: HTMLInputElement | undefined;

  const game = createMemo(() => project()?.compiled_game);
  const room = createMemo(() => {
    const currentGame = game();
    const currentState = state();
    if (!currentGame || !currentState) return undefined;
    return currentGame.rooms[currentState.room];
  });
  const verification = createMemo(() => {
    const currentGame = game();
    return currentGame ? verifyGame(currentGame) : undefined;
  });
  const inventoryItems = createMemo(() => {
    const currentGame = game();
    const currentState = state();
    if (!currentGame || !currentState) return [];
    return currentState.inventory.map((id) => currentGame.items[id]).filter((item) => item !== undefined);
  });
  const actionHints = createMemo(() => {
    const currentGame = game();
    const currentState = state();
    if (!currentGame || !currentState) return [];
    return availableActions(currentGame, currentState).map((action) => summarizeAction(action, currentGame));
  });

  function currentApiKey(): string | undefined {
    const key = apiKey().trim();
    return key || undefined;
  }

  function persistApiKey(key: string) {
    if (rememberKey()) localStorage.setItem("openrouter_api_key", key);
    else localStorage.removeItem("openrouter_api_key");
  }

  function loadProject(nextProject: AdventureProject, nextStatus: string) {
    setProject(nextProject);
    setProjectJson(projectToJson(nextProject));
    setWorldBible(nextProject.world_bible);
    setState(createInitialState(nextProject.compiled_game));
    setSelectedVerb("look");
    setSelectedItem(undefined);
    setPlaytestLog([]);
    setStatus(nextStatus);
    setError("");
  }

  function buildSampleProject() {
    loadProject(buildMachineStopsProject(sourceText()), "Built deterministic Machine Stops MVP project without a model call.");
    setActivePanel("design");
  }

  async function generateWorldBible() {
    const key = currentApiKey();
    if (!key) {
      setError("Enter an OpenRouter API key first, or use the deterministic sample button.");
      setStatus("Missing API key.");
      return;
    }

    setIsGenerating(true);
    setError("");
    setRawResponse("");
    setStatus("Generating world bible...");
    try {
      persistApiKey(key);
      const text = await streamTextJson({
        apiKey: key,
        model: model(),
        reasoningEffort: reasoningEffort(),
        prompt: worldBiblePrompt(sourceText()),
        onStatus: setStatus,
        onRaw: setRawResponse,
      });
      const parsed = JSON.parse(extractJsonObject(text)) as WorldBible;
      setWorldBible(parsed);
      setProject(undefined);
      setProjectJson(JSON.stringify({ world_bible: parsed }, null, 2));
      setStatus("World bible generated.");
      setActivePanel("design");
    } catch (caught) {
      setError(errorToText(caught));
      setStatus("World bible generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateAdventureDesign() {
    const key = currentApiKey();
    if (!key) {
      setError("Enter an OpenRouter API key first, or use the deterministic sample button.");
      setStatus("Missing API key.");
      return;
    }
    const bible = worldBible();
    if (!bible) {
      setError("Generate or load a world bible first.");
      setStatus("No world bible.");
      return;
    }

    setIsGenerating(true);
    setError("");
    setRawResponse("");
    setStatus("Generating adventure design...");
    try {
      persistApiKey(key);
      const text = await streamTextJson({
        apiKey: key,
        model: model(),
        reasoningEffort: reasoningEffort(),
        prompt: adventureDesignPrompt(sourceText(), bible),
        onStatus: setStatus,
        onRaw: setRawResponse,
      });
      const design = JSON.parse(extractJsonObject(text)) as AdventureDesign;
      loadProject(compileDesign(design, bible, bible.title || "Untitled Source"), "Adventure design generated and compiled.");
      setActivePanel("design");
    } catch (caught) {
      setError(errorToText(caught));
      setStatus("Adventure design generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateEndToEnd() {
    await generateWorldBible();
    if (!worldBible()) return;
    await generateAdventureDesign();
  }

  function applyProjectJson() {
    try {
      loadProject(parseProject(projectJson()), "Applied project JSON.");
    } catch (caught) {
      setError(errorToText(caught));
      setStatus("Project JSON is invalid.");
    }
  }

  async function saveProject() {
    const currentProject = project();
    if (!currentProject) return;
    const json = projectToJson(currentProject);
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: "adventure-design.json",
        types: [{ description: "Adventure project", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      setStatus("Saved adventure-design.json.");
      return;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "adventure-design.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded adventure-design.json.");
  }

  async function openProject() {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "Adventure project", accept: { "application/json": [".json"] } }],
      });
      const file = await handle.getFile();
      loadProject(parseProject(await file.text()), `Loaded ${file.name}.`);
      return;
    }
    projectImportInput?.click();
  }

  async function importProjectFile(file: File | undefined) {
    if (!file) return;
    try {
      loadProject(parseProject(await file.text()), `Imported ${file.name}.`);
    } catch (caught) {
      setError(errorToText(caught));
      setStatus("Project import failed.");
    }
  }

  async function importSourceFile(file: File | undefined) {
    if (!file) return;
    setSourceText(await file.text());
    setStatus(`Loaded source ${file.name}.`);
  }

  function dispatch(action: Action) {
    const currentGame = game();
    const currentState = state();
    if (!currentGame || !currentState) return;
    const result = resolveAction(currentGame, currentState, action);
    setState(result.state);
    if (result.ok && action.verb !== "use") setSelectedItem(undefined);
  }

  function clickHotspot(hotspot: Hotspot) {
    const verb = selectedVerb();
    if (hotspot.kind === "exit" && hotspot.targetRoom && verb === "walk") {
      dispatch({ verb: "walk", target: hotspot.targetRoom });
      return;
    }
    if (verb === "pickup" && hotspot.itemId) {
      dispatch({ verb, target: hotspot.itemId });
      return;
    }
    if (verb === "talk" && hotspot.npcId) {
      dispatch({ verb, target: hotspot.npcId });
      return;
    }
    dispatch({ verb, target: hotspot.id, item: verb === "use" ? selectedItem() : undefined });
  }

  function resetGame() {
    const currentGame = game();
    if (!currentGame) return;
    setState(createInitialState(currentGame));
    setSelectedVerb("look");
    setSelectedItem(undefined);
    setPlaytestLog([]);
  }

  function runAgent() {
    const currentGame = game();
    if (!currentGame) return;
    setPlaytestLog(runPlaytest(currentGame));
    setActivePanel("playtest");
  }

  return (
    <main class="app-shell">
      <section class="topbar">
        <div>
          <h1>Adventure Compiler</h1>
          <p>Client-side generator, verifier, point-and-click runner, and deterministic playtest agent.</p>
        </div>
        <nav class="tabs" aria-label="Workspace">
          <For each={[
            ["generate", "Generate"],
            ["design", "Design"],
            ["play", "Play"],
            ["playtest", "Playtest"],
          ] as Array<[Panel, string]>}>
            {([id, label]) => (
              <button
                type="button"
                class={`tab-button ${activePanel() === id ? "is-active" : ""}`}
                onClick={() => setActivePanel(id)}
              >
                {label}
              </button>
            )}
          </For>
        </nav>
      </section>

      <section class="status-strip">
        <strong>{status()}</strong>
        <Show when={error()}>
          <span class="error-text">{error()}</span>
        </Show>
      </section>

      <Show when={activePanel() === "generate"}>
        <section class="workspace two-col">
          <section class="panel">
            <header class="section-header">
              <h2>Source / Generation</h2>
            </header>
            <label>
              <span>OpenRouter API key</span>
              <input
                type="password"
                value={apiKey()}
                autocomplete="off"
                placeholder="sk-or-..."
                onInput={(event) => setApiKey(event.currentTarget.value)}
              />
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={rememberKey()}
                onChange={(event) => setRememberKey(event.currentTarget.checked)}
              />
              <span>Remember key in localStorage</span>
            </label>
            <div class="field-grid">
              <label>
                <span>Text model</span>
                <input value={model()} spellcheck={false} onInput={(event) => setModel(event.currentTarget.value)} />
              </label>
              <label>
                <span>Reasoning</span>
                <select
                  value={reasoningEffort()}
                  onChange={(event) => setReasoningEffort(event.currentTarget.value as TextReasoningEffort)}
                >
                  <option value="default">Default</option>
                  <option value="none">None</option>
                  <option value="minimal">Minimal</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">X-high</option>
                </select>
              </label>
            </div>
            <label>
              <span>Source text</span>
              <textarea
                rows={18}
                value={sourceText()}
                onInput={(event) => setSourceText(event.currentTarget.value)}
              />
            </label>
            <div class="button-row">
              <label class="file-button">
                Import Source
                <input type="file" accept=".txt,.md,text/plain" onChange={(event) => void importSourceFile(event.currentTarget.files?.[0])} />
              </label>
              <button type="button" onClick={buildSampleProject}>Build Sample MVP</button>
              <button type="button" disabled={isGenerating()} onClick={() => void generateWorldBible()}>
                Generate World Bible
              </button>
              <button type="button" disabled={isGenerating() || !worldBible()} onClick={() => void generateAdventureDesign()}>
                Generate Design
              </button>
              <button type="button" disabled={isGenerating()} onClick={() => void generateEndToEnd()}>
                Generate End-to-End
              </button>
            </div>
          </section>

          <section class="panel">
            <header class="section-header">
              <h2>Model Output</h2>
            </header>
            <pre>{rawResponse() || projectJson() || "No generated data yet."}</pre>
          </section>
        </section>
      </Show>

      <Show when={activePanel() === "design"}>
        <section class="workspace two-col">
          <section class="panel">
            <header class="section-header row-header">
              <h2>Design Workspace</h2>
              <div class="button-row compact">
                <button type="button" onClick={() => void openProject()}>Open</button>
                <button type="button" disabled={!project()} onClick={() => void saveProject()}>Save</button>
                <button type="button" disabled={!project()} onClick={applyProjectJson}>Apply JSON</button>
              </div>
            </header>
            <input
              ref={projectImportInput}
              class="hidden-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importProjectFile(event.currentTarget.files?.[0])}
            />
            <textarea
              class="json-editor"
              value={projectJson()}
              onInput={(event) => setProjectJson(event.currentTarget.value)}
              spellcheck={false}
            />
          </section>

          <section class="panel">
            <header class="section-header">
              <h2>Verifier</h2>
            </header>
            <Show when={verification()} fallback={<p class="muted">Generate or load a project first.</p>}>
              {(result) => (
                <div class="verifier">
                  <div class={`verifier-badge ${result().ok ? "ok" : "bad"}`}>
                    {result().ok ? "Playable" : "Blocked"} / {result().visitedStates} states
                  </div>
                  <Show when={result().errors.length}>
                    <h3>Errors</h3>
                    <ul>
                      <For each={result().errors}>{(entry) => <li>{entry}</li>}</For>
                    </ul>
                  </Show>
                  <Show when={result().warnings.length}>
                    <h3>Warnings</h3>
                    <ul>
                      <For each={result().warnings}>{(entry) => <li>{entry}</li>}</For>
                    </ul>
                  </Show>
                  <h3>Winning Plan</h3>
                  <ol>
                    <For each={result().winningPlan}>
                      {(action) => <li>{game() ? summarizeAction(action, game()!) : action.target}</li>}
                    </For>
                  </ol>
                  <div class="button-row">
                    <button type="button" disabled={!result().ok} onClick={() => setActivePanel("play")}>Play</button>
                    <button type="button" disabled={!result().ok} onClick={runAgent}>Run Agent</button>
                  </div>
                </div>
              )}
            </Show>
          </section>
        </section>
      </Show>

      <Show when={activePanel() === "play"}>
        <section class="workspace game-layout">
          <section class="panel game-panel">
            <header class="section-header row-header">
              <h2>{room()?.name ?? "No Room"}</h2>
              <div class="button-row compact">
                <button type="button" disabled={!project()} onClick={resetGame}>Reset</button>
                <button type="button" disabled={!verification()?.ok} onClick={runAgent}>Agent</button>
              </div>
            </header>
            <div class="room-stage">
              <div class="room-backdrop">
                <h3>{room()?.name}</h3>
                <p>{room()?.description}</p>
              </div>
              <Show when={room() && state()}>
                <For each={visibleHotspots(room()!, state()!)}>
                  {(hotspot) => (
                    <button
                      type="button"
                      class={`hotspot ${hotspot.kind}`}
                      style={{
                        left: `${hotspot.x}%`,
                        top: `${hotspot.y}%`,
                        width: `${hotspot.w}%`,
                        height: `${hotspot.h}%`,
                      }}
                      title={`${hotspot.name}: ${hotspot.description}`}
                      onClick={() => clickHotspot(hotspot)}
                    >
                      {hotspot.name}
                    </button>
                  )}
                </For>
              </Show>
            </div>
            <div class="verbs">
              <For each={["look", "pickup", "use", "talk", "walk"] as Verb[]}>
                {(verb) => (
                  <button
                    type="button"
                    class={selectedVerb() === verb ? "is-active" : ""}
                    onClick={() => setSelectedVerb(verb)}
                  >
                    {verb.toUpperCase()}
                  </button>
                )}
              </For>
            </div>
            <div class="inventory">
              <strong>Inventory</strong>
              <Show when={inventoryItems().length} fallback={<span class="muted">Empty</span>}>
                <For each={inventoryItems()}>
                  {(item) => (
                    <button
                      type="button"
                      class={selectedItem() === item.id ? "is-active" : ""}
                      title={item.description}
                      onClick={() => selectedVerb() === "look" ? dispatch({ verb: "look", target: item.id }) : setSelectedItem(item.id)}
                    >
                      {item.name}
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </section>

          <aside class="panel side-panel">
            <header class="section-header">
              <h2>Status</h2>
            </header>
            <p><strong>Verb:</strong> {selectedVerb().toUpperCase()}</p>
            <p><strong>Item:</strong> {selectedItem() ? game()?.items[selectedItem()!]?.name : "None"}</p>
            <p><strong>Flags:</strong> {state()?.flags.join(", ") || "None"}</p>
            <Show when={state()?.won}>
              <p class="win-text">Winning state reached.</p>
            </Show>
            <h3>Likely Actions</h3>
            <ul class="hint-list">
              <For each={actionHints().slice(0, 10)}>{(entry) => <li>{entry}</li>}</For>
            </ul>
            <h3>Transcript</h3>
            <pre>{state()?.transcript.join("\n") ?? "No game loaded."}</pre>
          </aside>
        </section>
      </Show>

      <Show when={activePanel() === "playtest"}>
        <section class="workspace two-col">
          <section class="panel">
            <header class="section-header row-header">
              <h2>Agent Playtest</h2>
              <button type="button" disabled={!verification()?.ok} onClick={runAgent}>Run Agent</button>
            </header>
            <pre>{playtestLog().join("\n") || "Run the verifier-backed agent after loading a playable project."}</pre>
          </section>
          <section class="panel">
            <header class="section-header">
              <h2>Plan Preview</h2>
            </header>
            <ol>
              <For each={verification()?.winningPlan ?? []}>
                {(action) => <li>{game() ? summarizeAction(action, game()!) : action.target}</li>}
              </For>
            </ol>
          </section>
        </section>
      </Show>
    </main>
  );
}
