## Proposed Architecture

### 0. Initial implementation target

Start as a **client-side JavaScript web app**, with source written in the same stack as [`edemaine/client-side-tanstack-ai-demo`](https://github.com/edemaine/client-side-tanstack-ai-demo):

* **Civet** for app logic and JSX-like UI source.
* **Solid** for reactive state and component rendering.
* **Vite** with `vite-plugin-solid` and `@danielx/civet/vite`.
* **Sass** for styling.
* **TanStack AI** with OpenRouter adapters for bring-your-own-key text and image calls.
* **No backend** for the first version.

The user enters their own OpenRouter key in the browser. The app may offer an optional “remember key” checkbox using `localStorage`, but the key is never shipped with the app and never sent through a server controlled by this project.

The first app should have three major panels:

* **Source / Generation**: paste or upload source text, configure model IDs and reasoning level, then generate the world bible and adventure design.
* **Design Workspace**: inspect and edit the structured game design before compiling it into the playable form.
* **Playable Game**: run the generated point-and-click adventure in the same web app.

The app should save and load the computed game design as a structured project file, for example `adventure-design.json`. Use the browser File System Access API when available for open/save/save-as, with a fallback to `<input type="file">` import and downloaded JSON export for browsers that do not expose direct file handles.

### 1. Ingest the source world

Input: one or more novels, public-domain books, your own writing, or licensed material.

The system extracts:

* characters
* places
* objects
* factions
* timeline
* tone and style
* recurring motifs
* forbidden contradictions
* possible conflicts and mysteries
* “adventureable” objects: keys, letters, rooms, maps, artifacts, disguises, locked doors, secrets

This becomes a **world bible**, not yet a game.

Important legal note: for private experiments, dropping in a novel you own is one thing; publishing a game “in that world” from copyrighted novels is another. For anything public or commercial, use public-domain texts, your own work, licensed material, or generate an original setting inspired by broad genre features rather than copying protected characters/worlds.

### 2. Generate a game design, not just prose

The generator should output a structured adventure spec, for example:

```json
{
  "premise": "...",
  "player_role": "...",
  "locations": [...],
  "npcs": [...],
  "items": [...],
  "puzzles": [...],
  "inventory_rules": [...],
  "dialogue_topics": [...],
  "win_conditions": [...],
  "fail_states": [...]
}
```

For a SCUMM-style game, the generated material should include a **location graph** and a **puzzle dependency graph**.

Example:

```text
Library → find wax seal
Kitchen → distract cook
Stable → obtain horse brush
Study → forge invitation using wax seal + ink
Ballroom → enter only if invitation forged
```

This is the part most AI story tools neglect. Without a puzzle graph, the game has no “game”.

### 3. Compile the spec into a custom web engine

For the first implementation, build a custom **point-and-click adventure engine** in the same Civet + Solid + Vite app instead of targeting Inform, QuestJS, Godot, Adventure Game Studio, or Ren'Py.

The engine should be deterministic and data-driven. It loads the generated adventure design and runs it as a classic SCUMM / Sierra-style game:

* room background
* exits
* hotspots
* inventory
* verb palette
* selected verb / selected inventory item
* dialogue topics
* event flags
* preconditions and effects
* win conditions
* optional fail states

The initial verb set should prefer point-and-click conventions over a parser:

```text
LOOK AT / PICK UP / USE / TALK TO / GIVE / OPEN / PUSH / WALK TO
```

Every interaction should be a structured action. For example, clicking `USE` and then a key on a locked cabinet dispatches an action like:

```json
{
  "verb": "use",
  "actor": "player",
  "item": "brass_key",
  "target": "locked_cabinet",
  "room": "antique_shop"
}
```

The engine checks the action against the design spec, mutates state only through declared effects, and returns a result object for the UI to render. The LLM can generate descriptions, hints, barks, and dialogue variants, but the engine decides whether the action is legal and what state changes happen.

The project file should store both generated design-time data and playable runtime data:

```json
{
  "schema_version": 1,
  "source": {
    "title": "...",
    "text_digest": "..."
  },
  "world_bible": {},
  "adventure_design": {},
  "compiled_game": {
    "start_room": "foyer",
    "rooms": {},
    "items": {},
    "npcs": {},
    "rules": [],
    "win_conditions": []
  },
  "assets": {
    "room_images": {},
    "portrait_images": {}
  }
}
```

### 4. Use the LLM only where it helps

The LLM should do:

* NPC dialogue
* flavor text
* hints
* alternative phrasings
* dynamic descriptions
* filling in non-critical details
* design repair suggestions when the verifier finds a reachability problem

The deterministic engine should control:

* inventory
* room transitions
* puzzle validity
* item state
* NPC knowledge state
* whether the player can progress
* canonical facts
* endings

This hybrid approach is important because research on LLMs playing classic text adventures shows that even strong current models struggle with sequential game reasoning and long-horizon puzzle solving. A 2026 Zork evaluation reported that tested LLMs performed poorly on average, suggesting that “just let the model reason through the game” is not enough. ([arXiv][5]) Similarly, the TALES benchmark found that even top LLM agents struggle on human-designed text adventure games. ([arXiv][6])

### 5. Add an “adventure compiler”

This is the interesting product idea.

You would have a pipeline like:

```text
Novel(s)
  ↓
World extraction
  ↓
World bible
  ↓
Adventure premise generator
  ↓
Location graph
  ↓
Puzzle graph
  ↓
Item/NPC/action database
  ↓
Playable game
  ↓
Test agent tries to solve it
  ↓
Repair unsolvable puzzles
```

The last step is crucial. The system should run automated playtests with AI agents and symbolic checks:

* Is every required item reachable?
* Is every puzzle solvable?
* Can the player soft-lock themselves?
* Are there unused important objects?
* Does every clue point somewhere?
* Is there a path from start to ending?
* Are there multiple solutions?

This is where your CS / formal-methods background could make the project unusually good. You could represent the generated adventure as a planning problem: actions have preconditions and effects, exactly like the Story2Game approach, then verify reachability and solvability. ([arXiv][4])

## A minimal prototype

Start with a **client-side point-and-click adventure builder and runner**, not a parser-style text adventure.

MVP:

1. Scaffold the app from the [`edemaine/client-side-tanstack-ai-demo`](https://github.com/edemaine/client-side-tanstack-ai-demo) pattern: `package.json`, `vite.config.mjs`, `src/main.civet`, `src/styles.sass`, `pnpm dev`, `pnpm test`, and `pnpm build`.
2. Accept pasted source text first; add file upload after the generation loop is stable.
3. Let the user enter an OpenRouter API key and editable text/image model IDs.
4. Generate a world bible.
5. Generate 6–10 rooms, 5–8 inventory objects, 3–5 puzzles, 2–4 NPCs, a location graph, and a puzzle dependency graph.
6. Compile the design into the in-browser point-and-click engine format.
7. Render one playable room at a time with a background image or placeholder, visible hotspots, exits, inventory, verb buttons, and a transcript/status line.
8. Support `LOOK AT`, `PICK UP`, `USE`, `TALK TO`, and `WALK TO` first; add `GIVE`, `OPEN`, and `PUSH` once rule handling is solid.
9. Save and load the computed design/project JSON from the local file system.
10. Run a deterministic reachability check before enabling “Play”, and show verifier errors in the design workspace.

The shortest useful loop is:

```text
Paste source text
  ↓
Generate world bible
  ↓
Generate adventure design
  ↓
Verify room and puzzle reachability
  ↓
Save adventure-design.json
  ↓
Play in the embedded point-and-click engine
```

## A stronger “SCUMM-like” version

For a LucasArts-style system, use verbs and hotspots:

```text
LOOK AT / PICK UP / USE / TALK TO / GIVE / OPEN / PUSH
```

The AI can help generate:

* backgrounds
* object descriptions
* character portraits
* barks
* dialogue trees
* alternative puzzle hints

But the actual verbs should be structured.

A room could be represented as:

```json
{
  "id": "antique_shop",
  "background_prompt": "A dusty 19th-century Antwerp antique shop...",
  "hotspots": [
    {
      "id": "locked_cabinet",
      "verbs": {
        "look": "The cabinet contains a velvet box...",
        "open": {
          "requires": ["brass_key"],
          "sets": ["cabinet_open"]
        }
      }
    }
  ]
}
```

Then the custom Solid renderer displays the background and hotspots. The LLM generates descriptions, hints, and dialogue, but the interaction model remains classic. The first visual implementation can use generated still backgrounds plus absolutely positioned hotspot regions. Later versions can add walkboxes, character sprites, animated cursors, verb-object sentence construction, dialogue portraits, and Sierra-style close-up views without changing the core data model.

## Related Work

Things **near** this exist, but there does not appear to be a polished “drop in a novel → get a playable Monkey Island / Zork / King’s Quest-style adventure in that world” system that reliably works end-to-end.

The closest existing categories are:

1. **AI text adventure platforms** such as AI Dungeon and newer AI Game Master systems. These are good at freeform narrative, but they often feel like chat/RPG improvisation rather than a real adventure game with puzzles, inventory, locations, gates, and solvable structure. Some 2026 comparison articles still frame AI Dungeon as the open-ended option, while alternatives add memory, rules, multiplayer, maps, or visual storytelling layers. ([Dungeons Deep][1])

2. **Interactive fiction engines** such as Inform 7, Twine, Quest/QuestJS, Ink, etc. QuestJS is a JavaScript rewrite of Quest for building parser-style interactive fiction. These give you proper game structure, but not automatic generation from novels. ([GitHub][2])

3. **Classic adventure tech** such as ScummVM, Adventure Game Studio, Godot, Ren’Py, etc. ScummVM itself is mostly for running classic adventure games from existing data files, not for creating new AI games; it replaces old executables so old adventure games can run on modern systems. ([ScummVM Documentation][3])

4. **Research prototypes**. The most directly relevant is **Story2Game**, a 2025 paper that generates interactive fiction by first generating a story, then deriving game state, actions, preconditions, and effects so the player can interact with it. That is very close to the architecture you are imagining, though it is research rather than a consumer-ready system. ([arXiv][4])

The key design lesson is: **do not make the LLM the whole game engine**. If the LLM simply narrates whatever the player types, you get an entertaining hallucination machine, not a real adventure game. Adventure games need persistent state, solvable puzzles, inventory constraints, location topology, NPC knowledge, event triggers, and “you can’t do that yet” logic.

For inspiration rather than turnkey use:

* **AI Dungeon**: useful to study open-ended AI narrative, but too unconstrained for real puzzle adventure structure. ([Dungeons Deep][1])
* **QuestJS**: useful inspiration for web-based interactive fiction data modeling, but not the initial engine target. ([GitHub][2])
* **Story2Game**: probably the most relevant research blueprint for generating playable interactive fiction from generated narrative structure. ([arXiv][4])
* **ScummVM**: useful as a reference for the classic adventure tradition, but not the right engine for creating a new AI-native game. ([ScummVM Documentation][3])
* **Intra design notes**: a useful cautionary discussion; making “LLM text adventure” sounds easy because both are text-in/text-out, but real interactive fiction depends on puzzle structure and a very specific game loop. ([Ian Bicking][7])

## Recommended Build Path

Do not start with “drop in two novels and generate a whole adventure.” That will produce something incoherent.

Start with:

**Phase 1: Client App Skeleton**
Create the Civet + Solid + Vite + Sass app, copying the BYOK TanStack AI shape from [`edemaine/client-side-tanstack-ai-demo`](https://github.com/edemaine/client-side-tanstack-ai-demo). Keep the app browser-only.

**Phase 2: World Bible Generator**
Paste or upload a short story. Generate characters, places, objects, tone, facts, and contradictions to avoid.

**Phase 3: Adventure Skeleton Generator**
Generate a point-and-click adventure design with rooms, exits, hotspots, NPCs, inventory objects, dialogue topics, verb responses, and a puzzle dependency graph.

**Phase 4: Save / Load**
Persist the computed project as JSON using the File System Access API where available, with import/export fallback. Include enough schema versioning to migrate early project files.

**Phase 5: Playability Verifier**
Translate puzzles into preconditions/effects and verify that the ending is reachable. Surface missing items, impossible gates, orphaned clues, and unused critical objects.

**Phase 6: Point-and-Click Engine**
Build the custom SCUMM/Sierra-style web engine: rooms, hotspots, exits, verbs, inventory, dialogue topics, flags, and deterministic action resolution.

**Phase 7: Images**
Generate or import one image per room and character portrait. Attach click regions to room images.

**Phase 8: Style Control**
Make the generated prose imitate the source’s mood, not necessarily its exact wording.

The resulting system would feel much more like a real old adventure game than a chatbot.

## Most Promising Version

The most promising product shape is:

> **“Adventure Compiler”: upload a public-domain novel or your own manuscript, choose ‘Zork’, ‘Monkey Island’, ‘King’s Quest’, or ‘visual novel’ mode, and get a playable, verified mini-adventure with generated rooms, puzzles, inventory, dialogue, and illustrations.”**

The genuinely hard part is not generating text. It is generating **solvable, fun, nontrivial puzzles**. That is where a hybrid of LLMs, planning, graph algorithms, and playtesting agents would shine.

[1]: https://dungeonsdeep.ai/blog/the-best-ai-dungeon-alternatives-in-2026?utm_source=chatgpt.com "Best AI Dungeon Alternatives in 2026 | Dungeons Deep"
[2]: https://github.com/ThePix/QuestJS?utm_source=chatgpt.com "GitHub - ThePix/QuestJS: A major re-write of Quest that is written in ..."
[3]: https://scumm-thedocs.readthedocs.io/?utm_source=chatgpt.com "Welcome to ScummVM! — ScummVM Documentation documentation"
[4]: https://arxiv.org/abs/2505.03547?utm_source=chatgpt.com "STORY2GAME: Generating (Almost) Everything in an Interactive Fiction Game"
[5]: https://arxiv.org/abs/2602.15867?utm_source=chatgpt.com "Playing With AI: How Do State-Of-The-Art Large Language Models Perform in the 1977 Text-Based Adventure Game Zork?"
[6]: https://arxiv.org/abs/2504.14128?utm_source=chatgpt.com "TALES: Text Adventure Learning Environment Suite"
[7]: https://ianbicking.org/blog/2025/07/intra-llm-text-adventure?utm_source=chatgpt.com "Intra: design notes on an LLM-driven text adventure"
