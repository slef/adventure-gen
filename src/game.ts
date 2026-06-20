export const verbs = ["look", "pickup", "use", "talk", "walk"] as const;

export type Verb = (typeof verbs)[number];

export interface WorldBible {
  title: string;
  logline: string;
  characters: NamedNote[];
  places: NamedNote[];
  objects: NamedNote[];
  factions: NamedNote[];
  motifs: string[];
  tone: string[];
  forbiddenContradictions: string[];
  adventureHooks: string[];
}

export interface NamedNote {
  id: string;
  name: string;
  note: string;
}

export interface AdventureDesign {
  premise: string;
  player_role: string;
  locations: DesignLocation[];
  npcs: DesignNpc[];
  items: DesignItem[];
  puzzles: DesignPuzzle[];
  location_graph: Edge[];
  puzzle_dependency_graph: Edge[];
  win_conditions: string[];
  fail_states: string[];
}

export interface DesignLocation {
  id: string;
  name: string;
  description: string;
  exits: string[];
}

export interface DesignNpc {
  id: string;
  name: string;
  location: string;
  description: string;
  dialogue: string[];
}

export interface DesignItem {
  id: string;
  name: string;
  location: string;
  description: string;
  portable: boolean;
}

export interface DesignPuzzle {
  id: string;
  name: string;
  room: string;
  goal: string;
  requires_items: string[];
  requires_flags: string[];
  grants_items: string[];
  sets_flags: string[];
  clue: string;
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
}

export interface AdventureProject {
  schema_version: 1;
  source: {
    title: string;
    text_digest: string;
  };
  world_bible: WorldBible;
  adventure_design: AdventureDesign;
  compiled_game: CompiledGame;
  assets: {
    room_images: Record<string, string>;
    portrait_images: Record<string, string>;
  };
}

export interface CompiledGame {
  start_room: string;
  rooms: Record<string, Room>;
  items: Record<string, Item>;
  npcs: Record<string, Npc>;
  rules: Rule[];
  win_conditions: Requirement[];
}

export interface Room {
  id: string;
  name: string;
  description: string;
  exits: string[];
  background_prompt: string;
  hotspots: Hotspot[];
}

export interface Hotspot {
  id: string;
  name: string;
  kind: "object" | "item" | "npc" | "exit";
  description: string;
  x: number;
  y: number;
  w: number;
  h: number;
  targetRoom?: string;
  itemId?: string;
  npcId?: string;
  visibleIf?: Requirement;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  portable: boolean;
  startRoom?: string;
}

export interface Npc {
  id: string;
  name: string;
  description: string;
  startRoom: string;
  dialogue: string[];
}

export interface Rule {
  id: string;
  verb: Verb;
  room?: string;
  target: string;
  item?: string;
  requires?: Requirement;
  effects: Effect;
  success: string;
  failure?: string;
}

export interface Requirement {
  items?: string[];
  flags?: string[];
}

export interface Effect {
  addItems?: string[];
  removeItems?: string[];
  setFlags?: string[];
  moveToRoom?: string;
}

export interface GameState {
  room: string;
  inventory: string[];
  flags: string[];
  transcript: string[];
  won: boolean;
}

export interface Action {
  verb: Verb;
  target: string;
  item?: string;
}

export interface ActionResult {
  state: GameState;
  message: string;
  ok: boolean;
}

export interface VerificationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  winningPlan: Action[];
  visitedStates: number;
}

export function createInitialState(game: CompiledGame): GameState {
  return {
    room: game.start_room,
    inventory: [],
    flags: [],
    transcript: [`You are in ${game.rooms[game.start_room]?.name ?? game.start_room}.`],
    won: false,
  };
}

export function compileDesign(design: AdventureDesign, bible: WorldBible, sourceTitle: string): AdventureProject {
  const rooms: Record<string, Room> = {};
  const items: Record<string, Item> = {};
  const npcs: Record<string, Npc> = {};
  const rules: Rule[] = [];

  for (const location of design.locations) {
    rooms[location.id] = {
      id: location.id,
      name: location.name,
      description: location.description,
      exits: location.exits.filter((exit) => design.locations.some((room) => room.id === exit)),
      background_prompt: `${location.name}: ${location.description}`,
      hotspots: [],
    };
  }

  for (const item of design.items) {
    items[item.id] = {
      id: item.id,
      name: item.name,
      description: item.description,
      portable: item.portable,
      startRoom: item.location,
    };
    rooms[item.location]?.hotspots.push({
      id: item.id,
      name: item.name,
      kind: "item",
      description: item.description,
      x: 12 + (rooms[item.location].hotspots.length * 13) % 66,
      y: 54 + (rooms[item.location].hotspots.length * 9) % 28,
      w: 16,
      h: 12,
      itemId: item.id,
    });
  }

  for (const npc of design.npcs) {
    npcs[npc.id] = {
      id: npc.id,
      name: npc.name,
      description: npc.description,
      startRoom: npc.location,
      dialogue: npc.dialogue,
    };
    rooms[npc.location]?.hotspots.push({
      id: npc.id,
      name: npc.name,
      kind: "npc",
      description: npc.description,
      x: 62,
      y: 36,
      w: 20,
      h: 26,
      npcId: npc.id,
    });
  }

  for (const room of Object.values(rooms)) {
    room.exits.forEach((exit, index) => {
      const target = rooms[exit];
      room.hotspots.push({
        id: `exit_${room.id}_${exit}`,
        name: target?.name ?? exit,
        kind: "exit",
        description: `Walk to ${target?.name ?? exit}.`,
        x: index % 2 === 0 ? 2 : 84,
        y: 18 + index * 15,
        w: 14,
        h: 22,
        targetRoom: exit,
      });
    });
  }

  for (const puzzle of design.puzzles) {
    rules.push({
      id: puzzle.id,
      verb: "use",
      room: puzzle.room,
      target: puzzle.id,
      item: puzzle.requires_items[0],
      requires: {
        items: puzzle.requires_items,
        flags: puzzle.requires_flags,
      },
      effects: {
        addItems: puzzle.grants_items,
        setFlags: puzzle.sets_flags,
      },
      success: puzzle.goal,
      failure: puzzle.clue,
    });

    rooms[puzzle.room]?.hotspots.push({
      id: puzzle.id,
      name: puzzle.name,
      kind: "object",
      description: puzzle.clue,
      x: 36,
      y: 20 + (rooms[puzzle.room].hotspots.length * 11) % 44,
      w: 24,
      h: 14,
    });
  }

  const winFlag = design.win_conditions[0] ?? "win";

  return {
    schema_version: 1,
    source: {
      title: sourceTitle,
      text_digest: digestText(`${bible.title}:${design.premise}`),
    },
    world_bible: bible,
    adventure_design: design,
    compiled_game: {
      start_room: design.locations[0]?.id ?? "vashtis_cell",
      rooms,
      items,
      npcs,
      rules,
      win_conditions: [{ flags: [winFlag] }],
    },
    assets: {
      room_images: {},
      portrait_images: {},
    },
  };
}

export function verifyGame(game: CompiledGame): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!game.rooms[game.start_room]) {
    errors.push(`Start room '${game.start_room}' does not exist.`);
  }

  for (const room of Object.values(game.rooms)) {
    for (const exit of room.exits) {
      if (!game.rooms[exit]) errors.push(`Room '${room.id}' exits to missing room '${exit}'.`);
    }
    for (const hotspot of room.hotspots) {
      if (hotspot.kind === "item" && hotspot.itemId && !game.items[hotspot.itemId]) {
        errors.push(`Hotspot '${hotspot.id}' references missing item '${hotspot.itemId}'.`);
      }
      if (hotspot.kind === "npc" && hotspot.npcId && !game.npcs[hotspot.npcId]) {
        errors.push(`Hotspot '${hotspot.id}' references missing NPC '${hotspot.npcId}'.`);
      }
    }
  }

  for (const rule of game.rules) {
    if (!game.rooms[rule.room ?? game.start_room]) errors.push(`Rule '${rule.id}' uses missing room '${rule.room}'.`);
    if (rule.item && !game.items[rule.item]) errors.push(`Rule '${rule.id}' requires missing item '${rule.item}'.`);
  }

  if (errors.length) {
    return { ok: false, errors, warnings, winningPlan: [], visitedStates: 0 };
  }

  const start = createInitialState(game);
  const queue: Array<{ state: GameState; plan: Action[] }> = [{ state: start, plan: [] }];
  const seen = new Set<string>([stateKey(start)]);
  let winningPlan: Action[] = [];

  while (queue.length > 0 && seen.size < 5000) {
    const current = queue.shift();
    if (!current) break;

    if (hasWon(game, current.state)) {
      winningPlan = current.plan;
      break;
    }

    for (const action of availableActions(game, current.state)) {
      const result = resolveAction(game, current.state, action);
      if (!result.ok) continue;
      const key = stateKey(result.state);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: result.state, plan: [...current.plan, action] });
    }
  }

  if (!winningPlan.length) errors.push("No reachable winning state found.");

  const reachableRooms = new Set<string>();
  for (const key of seen) reachableRooms.add(key.split("|", 1)[0]);
  for (const room of Object.keys(game.rooms)) {
    if (!reachableRooms.has(room)) warnings.push(`Room '${room}' was not reached by the verifier.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    winningPlan,
    visitedStates: seen.size,
  };
}

export function availableActions(game: CompiledGame, state: GameState): Action[] {
  const room = game.rooms[state.room];
  if (!room) return [];

  const actions: Action[] = [];

  for (const exit of room.exits) {
    actions.push({ verb: "walk", target: exit });
  }

  for (const hotspot of visibleHotspots(room, state)) {
    actions.push({ verb: "look", target: hotspot.id });
    if (hotspot.kind === "item" && hotspot.itemId && !state.inventory.includes(hotspot.itemId)) {
      actions.push({ verb: "pickup", target: hotspot.itemId });
    }
    if (hotspot.kind === "npc" && hotspot.npcId) {
      actions.push({ verb: "talk", target: hotspot.npcId });
    }
  }

  for (const rule of game.rules) {
    if (rule.room && rule.room !== state.room) continue;
    if (rule.item && !state.inventory.includes(rule.item)) continue;
    actions.push({ verb: rule.verb, target: rule.target, item: rule.item });
  }

  return actions;
}

export function resolveAction(game: CompiledGame, state: GameState, action: Action): ActionResult {
  const room = game.rooms[state.room];
  if (!room) return fail(state, "This place has fallen out of the map.");

  if (action.verb === "walk") {
    if (!room.exits.includes(action.target)) return fail(state, "There is no route that way.");
    const next = { ...state, room: action.target };
    return ok(game, next, `You walk to ${game.rooms[action.target]?.name ?? action.target}.`);
  }

  if (action.verb === "look") {
    const hotspot = visibleHotspots(room, state).find((entry) => entry.id === action.target);
    if (hotspot) return ok(game, state, hotspot.description);
    const item = game.items[action.target];
    if (item && state.inventory.includes(item.id)) return ok(game, state, item.description);
    return ok(game, state, room.description);
  }

  if (action.verb === "pickup") {
    const item = game.items[action.target];
    const hotspot = visibleHotspots(room, state).find((entry) => entry.itemId === action.target);
    if (!item || !hotspot || !item.portable) return fail(state, "You cannot pick that up.");
    if (state.inventory.includes(item.id)) return fail(state, "You already have it.");
    const next = { ...state, inventory: sortedUnique([...state.inventory, item.id]) };
    return ok(game, next, `Taken: ${item.name}.`);
  }

  if (action.verb === "talk") {
    const npc = game.npcs[action.target];
    if (!npc || npc.startRoom !== state.room) return fail(state, "There is no one here to answer.");
    return ok(game, state, npc.dialogue[0] ?? `${npc.name} has nothing to say.`);
  }

  const rule = game.rules.find((entry) => {
    return entry.verb === action.verb
      && entry.target === action.target
      && (!entry.item || entry.item === action.item)
      && (!entry.room || entry.room === state.room);
  });

  if (!rule) return fail(state, "That does not seem to do anything.");

  if (!meetsRequirement(state, rule.requires)) {
    return fail(state, rule.failure ?? "Something is still missing.");
  }

  const next = applyEffect(state, rule.effects);
  return ok(game, next, rule.success);
}

export function runPlaytest(game: CompiledGame): string[] {
  const verification = verifyGame(game);
  if (!verification.ok) return [`Playtest blocked: ${verification.errors.join(" ")}`];

  let state = createInitialState(game);
  const lines = [`Agent starting in ${game.rooms[state.room]?.name ?? state.room}.`];
  for (const action of verification.winningPlan) {
    const result = resolveAction(game, state, action);
    const itemPart = action.item ? ` ${game.items[action.item]?.name ?? action.item} on` : "";
    lines.push(`${action.verb.toUpperCase()}${itemPart} ${labelForTarget(game, action.target)} -> ${result.message}`);
    state = result.state;
  }
  lines.push(state.won || hasWon(game, state) ? "Agent reached a winning state." : "Agent did not reach the ending.");
  return lines;
}

export function visibleHotspots(room: Room, state: GameState): Hotspot[] {
  return room.hotspots.filter((hotspot) => meetsRequirement(state, hotspot.visibleIf));
}

export function projectToJson(project: AdventureProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): AdventureProject {
  const parsed = JSON.parse(json) as AdventureProject;
  if (parsed.schema_version !== 1 || !parsed.compiled_game) {
    throw new Error("Expected an AdventureProject with schema_version 1 and compiled_game.");
  }
  return parsed;
}

export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object found in model response.");
  return candidate.slice(start, end + 1);
}

export function buildMachineStopsProject(sourceText: string): AdventureProject {
  const bible = buildMachineStopsBible();
  const design = buildMachineStopsDesign();
  return {
    ...compileDesign(design, bible, "The Machine Stops"),
    source: {
      title: "The Machine Stops",
      text_digest: digestText(sourceText),
    },
  };
}

export function summarizeAction(action: Action, game: CompiledGame): string {
  const itemPart = action.item ? `${game.items[action.item]?.name ?? action.item} -> ` : "";
  return `${action.verb.toUpperCase()} ${itemPart}${labelForTarget(game, action.target)}`;
}

function ok(game: CompiledGame, state: GameState, message: string): ActionResult {
  const won = state.won || hasWon(game, state);
  const next = { ...state, won, transcript: [...state.transcript, message] };
  return { state: next, message, ok: true };
}

function fail(state: GameState, message: string): ActionResult {
  return { state: { ...state, transcript: [...state.transcript, message] }, message, ok: false };
}

function applyEffect(state: GameState, effect: Effect): GameState {
  const inventory = sortedUnique([
    ...state.inventory.filter((item) => !effect.removeItems?.includes(item)),
    ...(effect.addItems ?? []),
  ]);
  const flags = sortedUnique([...state.flags, ...(effect.setFlags ?? [])]);
  return {
    ...state,
    room: effect.moveToRoom ?? state.room,
    inventory,
    flags,
  };
}

function meetsRequirement(state: GameState, requirement?: Requirement): boolean {
  if (!requirement) return true;
  return (requirement.items ?? []).every((item) => state.inventory.includes(item))
    && (requirement.flags ?? []).every((flag) => state.flags.includes(flag));
}

function hasWon(game: CompiledGame, state: GameState): boolean {
  return game.win_conditions.some((condition) => meetsRequirement(state, condition));
}

function stateKey(state: GameState): string {
  return `${state.room}|${state.inventory.join(",")}|${state.flags.join(",")}`;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function labelForTarget(game: CompiledGame, target: string): string {
  return game.rooms[target]?.name
    ?? game.items[target]?.name
    ?? game.npcs[target]?.name
    ?? Object.values(game.rooms).flatMap((room) => room.hotspots).find((hotspot) => hotspot.id === target)?.name
    ?? target;
}

function digestText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildMachineStopsBible(): WorldBible {
  return {
    title: "The Machine Stops",
    logline: "A subterranean society worships an all-providing Machine while a dissident son searches for direct contact and the surface.",
    characters: [
      { id: "vashti", name: "Vashti", note: "A lecturer devoted to mediated life and the rituals of the Machine." },
      { id: "kuno", name: "Kuno", note: "Vashti's son, restless, physical, and convinced that humanity must see the surface." },
      { id: "committee", name: "Committee voices", note: "Remote administrators who enforce mechanical orthodoxy." },
    ],
    places: [
      { id: "cell", name: "Hexagonal cell", note: "A self-contained underground room controlled by buttons and plates." },
      { id: "airship", name: "Air-ship route", note: "The sanctioned transit path across the surface, distant and alien." },
      { id: "mending", name: "Mending apparatus", note: "Maintenance channels and ducts beneath official comfort." },
      { id: "surface", name: "The surface", note: "Forbidden open air, stars, hills, and unmediated contact." },
    ],
    objects: [
      { id: "blue_plate", name: "Blue communication plate", note: "The glowing screen that carries voices and faces." },
      { id: "book", name: "Book of the Machine", note: "Sacred manual and social scripture." },
      { id: "respirator", name: "Respirator", note: "Device required for sanctioned travel." },
      { id: "hatch_key", name: "Maintenance hatch key", note: "A practical object the Machine culture hides in plain sight." },
    ],
    factions: [
      { id: "orthodox", name: "Machine orthodoxy", note: "People who treat mechanical convenience as religion." },
      { id: "dissenters", name: "Embodied dissenters", note: "Rare humans seeking direct experience and forbidden movement." },
    ],
    motifs: ["buttons", "soft radiance", "isolation", "lectures", "forbidden air", "hands touching"],
    tone: ["claustrophobic", "satirical", "melancholy", "urgent"],
    forbiddenContradictions: [
      "The Machine should feel powerful but decaying, not magical.",
      "The surface is feared by society, not commonly visited.",
      "Kuno wants embodied contact rather than better remote communication.",
    ],
    adventureHooks: [
      "Recover Kuno's route before the Committee seals the channels.",
      "Use orthodox rituals against the Machine's own bureaucracy.",
      "Trade comfort for dangerous direct contact with the world.",
    ],
  };
}

function buildMachineStopsDesign(): AdventureDesign {
  return {
    premise: "As Vashti, reconstruct Kuno's forbidden route through the Machine before the Committee deletes every trace.",
    player_role: "Vashti, forced to act physically after Kuno's call is cut short.",
    locations: [
      { id: "vashtis_cell", name: "Vashti's Cell", description: "A hexagonal room of buttons, soft radiance, and obedient furniture.", exits: ["lecture_exchange"] },
      { id: "lecture_exchange", name: "Lecture Exchange", description: "A wall of humming plates where approved ideas circulate without bodies.", exits: ["vashtis_cell", "airship_dock", "mending_gallery"] },
      { id: "airship_dock", name: "Air-ship Dock", description: "A sterile embarkation chamber with respirators locked behind procedural glass.", exits: ["lecture_exchange", "surface_view"] },
      { id: "mending_gallery", name: "Mending Gallery", description: "Narrow service passages vibrate behind the polite panels of civilization.", exits: ["lecture_exchange", "maintenance_shaft"] },
      { id: "maintenance_shaft", name: "Maintenance Shaft", description: "A steep ribbed shaft descends where the Machine's breath grows uneven.", exits: ["mending_gallery", "forgotten_tunnel"] },
      { id: "forgotten_tunnel", name: "Forgotten Tunnel", description: "Old brick, dust, and human scratches survive beyond the official diagrams.", exits: ["maintenance_shaft", "surface_view"] },
      { id: "surface_view", name: "Surface View", description: "A cold platform opens toward stars, wind, and the forbidden shape of hills.", exits: ["airship_dock", "forgotten_tunnel"] },
    ],
    npcs: [
      { id: "kuno", name: "Kuno", location: "vashtis_cell", description: "His image flickers on the blue plate, impatient and alive.", dialogue: ["Find the draft behind the Book. Do not ask the Machine for permission."] },
      { id: "attendant", name: "Dock Attendant", location: "airship_dock", description: "A polite clerk whose faith rests on forms and locks.", dialogue: ["Respirators are issued for approved journeys only. A lecture seal would suffice."] },
      { id: "mender", name: "Mender", location: "mending_gallery", description: "A tired worker who knows which panels no one audits.", dialogue: ["The hatch key is useless without a real route. The Machine hates undocumented corridors."] },
    ],
    items: [
      { id: "book", name: "Book of the Machine", location: "vashtis_cell", description: "A heavy manual whose margin hides Kuno's cramped route marks.", portable: true },
      { id: "route_notes", name: "Kuno's Route Notes", location: "inventory_cache", description: "Pencil marks naming the mending gallery, the shaft, and the old tunnel.", portable: true },
      { id: "lecture_seal", name: "Lecture Seal", location: "lecture_exchange", description: "An authorization token for respectable intellectual errands.", portable: true },
      { id: "respirator", name: "Respirator", location: "inventory_cache", description: "A travel mask with filters smelling faintly of metal.", portable: true },
      { id: "hatch_key", name: "Maintenance Hatch Key", location: "mending_gallery", description: "A plain key no lecturer would think to value.", portable: true },
      { id: "surface_map", name: "Surface Map", location: "forgotten_tunnel", description: "A scratched diagram from the last people who walked without permission.", portable: true },
    ],
    puzzles: [
      {
        id: "decode_book",
        name: "Decode Kuno's Margins",
        room: "vashtis_cell",
        goal: "The book's devotional headings become a route through the mending gallery.",
        requires_items: ["book"],
        requires_flags: [],
        grants_items: ["route_notes"],
        sets_flags: ["route_decoded"],
        clue: "Kuno said the Book contains what the Machine would never read as action.",
      },
      {
        id: "authorize_trip",
        name: "Authorize a False Lecture Trip",
        room: "lecture_exchange",
        goal: "The exchange stamps your lecture seal for a harmless study of Australian music.",
        requires_items: ["route_notes", "lecture_seal"],
        requires_flags: ["route_decoded"],
        grants_items: ["respirator"],
        sets_flags: ["travel_authorized"],
        clue: "The dock listens to credentials, not motives.",
      },
      {
        id: "open_hatch",
        name: "Open the Mending Hatch",
        room: "mending_gallery",
        goal: "The hatch opens into a maintenance shaft with a cough of stale air.",
        requires_items: ["hatch_key", "route_notes"],
        requires_flags: ["route_decoded"],
        grants_items: [],
        sets_flags: ["hatch_open"],
        clue: "A key without Kuno's route only opens anonymous danger.",
      },
      {
        id: "trace_tunnel",
        name: "Trace the Forgotten Tunnel",
        room: "forgotten_tunnel",
        goal: "The old surface map reveals the final stair toward Kuno's platform.",
        requires_items: ["surface_map", "respirator"],
        requires_flags: ["hatch_open", "travel_authorized"],
        grants_items: [],
        sets_flags: ["surface_route_known"],
        clue: "The air is too thin for courage alone.",
      },
      {
        id: "reach_kuno",
        name: "Reach Kuno's Platform",
        room: "surface_view",
        goal: "You step into the wind and understand why Kuno wanted a hand, not a plate.",
        requires_items: ["respirator"],
        requires_flags: ["surface_route_known"],
        grants_items: [],
        sets_flags: ["reached_surface"],
        clue: "The platform is visible, but the safe route through the tunnel is not yet certain.",
      },
    ],
    location_graph: [
      { from: "vashtis_cell", to: "lecture_exchange" },
      { from: "lecture_exchange", to: "airship_dock" },
      { from: "lecture_exchange", to: "mending_gallery" },
      { from: "mending_gallery", to: "maintenance_shaft" },
      { from: "maintenance_shaft", to: "forgotten_tunnel" },
      { from: "forgotten_tunnel", to: "surface_view" },
    ],
    puzzle_dependency_graph: [
      { from: "decode_book", to: "authorize_trip", label: "route_notes" },
      { from: "decode_book", to: "open_hatch", label: "route_notes" },
      { from: "authorize_trip", to: "trace_tunnel", label: "respirator" },
      { from: "open_hatch", to: "trace_tunnel", label: "hatch_open" },
      { from: "trace_tunnel", to: "reach_kuno", label: "surface_route_known" },
    ],
    win_conditions: ["reached_surface"],
    fail_states: ["Committee erases Kuno's route before Vashti leaves mediated rooms."],
  };
}
