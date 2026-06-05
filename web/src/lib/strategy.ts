import type { StrategyDoc } from "../types/firestore";

// Page-level content (release) phases.
export const CONTENT_PHASES = [
  { id: "1", label: "Phase 1", hint: "Kara · Gruul · Mag" },
  { id: "2", label: "Phase 2", hint: "SSC · Tempest Keep" }
] as const;

export const LINK_KINDS = ["video", "doc", "link"] as const;
export const LINK_ICONS: Record<string, string> = { video: "\u{1F3AC}", doc: "\u{1F4C4}", link: "\u{1F517}" };
export const LINK_FALLBACK_LABEL: Record<string, string> = { video: "Video", doc: "Document", link: "Link" };

// Map a block label keyword → a colour tone for assignment blocks.
const BLOCK_TONES: Array<{ tone: string; test: RegExp }> = [
  { tone: "tank", test: /\btank/i },
  { tone: "heal", test: /heal/i },
  { tone: "interrupt", test: /interrupt|kick|silence|purge|dispel/i },
  { tone: "kill", test: /kill|focus|order|priority/i },
  { tone: "position", test: /position|spread|stack|move|location|placement|kite/i },
  { tone: "threat", test: /misdirect|threat|tricks|aggro/i },
  { tone: "utility", test: /curse|warlock|mage|sheep|banish|\bcc\b|soulstone|\bss\b|innervate|bloodlust|hero|tremor|fear ward/i }
];

export function toneForLabel(label: string): string {
  for (const t of BLOCK_TONES) if (t.test.test(label)) return t.tone;
  return "neutral";
}

export interface StrategyBlock {
  label: string;
  tone: string;
  items: string[];
}
export interface FightPhase {
  name: string;
  blocks: StrategyBlock[];
  loose: string[];
}
export interface ParsedContent {
  intro: string[];
  phases: FightPhase[];
}

// "# Phase" → fight phase, "## Group" → colour block, plain line → bullet.
export function parseEntryContent(notes?: string[]): ParsedContent {
  const lines = Array.isArray(notes) ? notes : [];
  const intro: string[] = [];
  const phases: FightPhase[] = [];
  let curPhase: FightPhase | null = null;
  let curBlock: StrategyBlock | null = null;
  for (const raw of lines) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      const label = line.slice(3).trim();
      if (!curPhase) {
        curPhase = { name: "", blocks: [], loose: [] };
        phases.push(curPhase);
      }
      curBlock = { label, tone: toneForLabel(label), items: [] };
      curPhase.blocks.push(curBlock);
    } else if (line.startsWith("# ")) {
      curPhase = { name: line.slice(2).trim(), blocks: [], loose: [] };
      phases.push(curPhase);
      curBlock = null;
    } else {
      const item = line.replace(/^[-*•]\s*/, "");
      if (curBlock) curBlock.items.push(item);
      else if (curPhase) curPhase.loose.push(item);
      else intro.push(item);
    }
  }
  return { intro, phases };
}

export function sectionPhase(section: StrategyDoc): string {
  const p = section?.phase;
  if (p === 1 || p === "1") return "1";
  if (p === 2 || p === "2") return "2";
  return "all";
}

export function sectionVisibleInPhase(section: StrategyDoc, phase: string): boolean {
  const sp = sectionPhase(section);
  return sp === "all" || sp === phase;
}
