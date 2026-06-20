Yes, things **near** this exist, but I don’t think there is yet a polished “drop in a novel → get a playable Monkey Island / Zork / King’s Quest-style adventure in that world” system that reliably works end-to-end.

The closest existing categories are:

1. **AI text adventure platforms** such as AI Dungeon and newer AI Game Master systems. These are good at freeform narrative, but they often feel like chat/RPG improvisation rather than a real adventure game with puzzles, inventory, locations, gates, and solvable structure. Some 2026 comparison articles still frame AI Dungeon as the open-ended option, while alternatives add memory, rules, multiplayer, maps, or visual storytelling layers. ([Dungeons Deep][1])

2. **Interactive fiction engines** such as Inform 7, Twine, Quest/QuestJS, Ink, etc. QuestJS is a JavaScript rewrite of Quest for building parser-style interactive fiction. These give you proper game structure, but not automatic generation from novels. ([GitHub][2])

3. **Classic adventure tech** such as ScummVM, Adventure Game Studio, Godot, Ren’Py, etc. ScummVM itself is mostly for running classic adventure games from existing data files, not for creating new AI games; it replaces old executables so old adventure games can run on modern systems. ([ScummVM Documentation][3])

4. **Research prototypes**. The most directly relevant is **Story2Game**, a 2025 paper that generates interactive fiction by first generating a story, then deriving game state, actions, preconditions, and effects so the player can interact with it. That is very close to the architecture you are imagining, though it is research rather than a consumer-ready system. ([arXiv][4])

The key design lesson is: **do not make the LLM the whole game engine**. If the LLM simply narrates whatever the player types, you get an entertaining hallucination machine, not a real adventure game. Adventure games need persistent state, solvable puzzles, inventory constraints, location topology, NPC knowledge, event triggers, and “you can’t do that yet” logic.

A good system would look like this.

## The architecture I would build

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

### 3. Compile the spec into a real engine

You have a few plausible targets:

For **text adventure / parser style**, use:

* **Inform 7** if you want classic literary interactive fiction.
* **QuestJS** if you want a web-native JavaScript engine. ([GitHub][2])
* **Ink** if you want branching narrative with variables and conditions.
* **Twine** if you want hypertext-style exploration.

For **old text+image / point-and-click style**, use:

* **Godot** for a modern open-source engine.
* **Adventure Game Studio** for a Sierra/LucasArts-like workflow.
* **Ren’Py** if it leans more visual novel.
* A custom web app if you want to move quickly.

I would probably prototype as a **web game** first: React or Svelte frontend, a small Python/Node backend, and a game-state engine that stores rooms, objects, inventory, NPC state, and event flags.

### 4. Use the LLM only where it helps

The LLM should do:

* natural-language parsing: “use the rusty knife to pry open the drawer”
* NPC dialogue
* flavor text
* hints
* alternative phrasings
* dynamic descriptions
* filling in non-critical details

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

I would start with a **text + still image** adventure, not full point-and-click.

MVP:

1. Upload a public-domain novella or your own short story.
2. Extract a world bible.
3. Generate 8–12 rooms.
4. Generate 5–8 inventory objects.
5. Generate 3–5 puzzles.
6. Generate one main quest and one optional side quest.
7. Use a deterministic state machine.
8. Let the player type natural-language commands.
9. Use image generation for room illustrations and NPC portraits.
10. Use an LLM as “parser + narrator”, but never as the sole source of truth.

A command loop might work like this:

```text
Player: talk to the old jeweler about the blue diamond

LLM parser:
{
  "intent": "talk",
  "target": "old_jeweler",
  "topic": "blue_diamond"
}

Game engine:
- Is old_jeweler in current room? yes.
- Does player know about blue_diamond? yes.
- Has player shown the sealed letter? no.
- Return dialogue state: evasive_answer.

LLM narrator:
"The jeweler polishes his spectacles and pretends not to hear you..."
```

This preserves the feeling of parser games while avoiding the brittleness of exact commands like `ASK JEWELER ABOUT DIAMOND`.

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

Then a Godot or web frontend renders the background and hotspots. The LLM generates descriptions, hints, and dialogue, but the interaction model remains classic.

## Existing things worth looking at

For inspiration rather than turnkey use:

* **AI Dungeon**: useful to study open-ended AI narrative, but too unconstrained for real puzzle adventure structure. ([Dungeons Deep][1])
* **QuestJS**: good candidate for a web-based interactive fiction target. ([GitHub][2])
* **Story2Game**: probably the most relevant research blueprint for generating playable interactive fiction from generated narrative structure. ([arXiv][4])
* **ScummVM**: useful as a reference for the classic adventure tradition, but not the engine I would use to create a new AI-native game. ([ScummVM Documentation][3])
* **Intra design notes**: a useful cautionary discussion; making “LLM text adventure” sounds easy because both are text-in/text-out, but real interactive fiction depends on puzzle structure and a very specific game loop. ([Ian Bicking][7])

## My recommended build path

I would not start with “drop in two novels and generate a whole adventure.” That will produce something incoherent.

I would start with:

**Phase 1: World Bible Generator**
Upload a short story. Generate characters, places, objects, tone, and facts.

**Phase 2: Adventure Skeleton Generator**
Generate a 10-room, 5-puzzle adventure with a dependency graph.

**Phase 3: Playability Verifier**
Translate puzzles into preconditions/effects and verify that the ending is reachable.

**Phase 4: Play Engine**
Build a text adventure web frontend with natural-language command parsing.

**Phase 5: Images**
Generate one image per room and character portrait. Add clickable hotspots later.

**Phase 6: Style Control**
Make the generated prose imitate the source’s mood, not necessarily its exact wording.

The resulting system would feel much more like a real old adventure game than a chatbot.

## The version I think is most promising

A product I’d be excited by would be:

> **“Adventure Compiler”: upload a public-domain novel or your own manuscript, choose ‘Zork’, ‘Monkey Island’, ‘King’s Quest’, or ‘visual novel’ mode, and get a playable, verified mini-adventure with generated rooms, puzzles, inventory, dialogue, and illustrations.”**

The genuinely hard part is not generating text. It is generating **solvable, fun, nontrivial puzzles**. That is where a hybrid of LLMs, planning, graph algorithms, and playtesting agents would shine.

[1]: https://dungeonsdeep.ai/blog/the-best-ai-dungeon-alternatives-in-2026?utm_source=chatgpt.com "Best AI Dungeon Alternatives in 2026 | Dungeons Deep"
[2]: https://github.com/ThePix/QuestJS?utm_source=chatgpt.com "GitHub - ThePix/QuestJS: A major re-write of Quest that is written in ..."
[3]: https://scumm-thedocs.readthedocs.io/?utm_source=chatgpt.com "Welcome to ScummVM! — ScummVM Documentation documentation"
[4]: https://arxiv.org/abs/2505.03547?utm_source=chatgpt.com "STORY2GAME: Generating (Almost) Everything in an Interactive Fiction Game"
[5]: https://arxiv.org/abs/2602.15867?utm_source=chatgpt.com "Playing With AI: How Do State-Of-The-Art Large Language Models Perform in the 1977 Text-Based Adventure Game Zork?"
[6]: https://arxiv.org/abs/2504.14128?utm_source=chatgpt.com "TALES: Text Adventure Learning Environment Suite"
[7]: https://ianbicking.org/blog/2025/07/intra-llm-text-adventure?utm_source=chatgpt.com "Intra: design notes on an LLM-driven text adventure"
