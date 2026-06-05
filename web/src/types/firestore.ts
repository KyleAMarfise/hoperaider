export type LinkKind = "video" | "doc" | "link";

export interface StrategyLink {
  kind: LinkKind;
  label?: string;
  url: string;
}

// One Firestore doc in the `strategy` collection — either a section or an entry
// (distinguished by `kind`). The `pageConfig` doc is read separately.
export interface StrategyDoc {
  id: string;
  kind?: "section" | "entry";
  title?: string;
  emoji?: string;
  layout?: "grid" | "list";
  phase?: number | string; // section content-phase: 1 | 2 | "all"
  sectionId?: string; // entry → parent section
  tag?: string;
  notes?: string[];
  links?: StrategyLink[];
  order?: number;
}

export interface StrategyConfig {
  id?: string;
  title?: string;
  intro?: string;
  seedVersion?: number;
}

export interface RaidRoleSpecSlot {
  role: string;
  class: string;
  spec: string;
  count: number;
}

export interface Raid {
  id: string;
  raidName?: string;
  raidDate?: string; // YYYY-MM-DD
  phase?: number;
  runType?: string;
  raidSize?: string;
  raidStart?: number; // CST hour 0-23
  raidEnd?: number; // CST hour 1-24
  raidLeader?: string;
  tankSlots?: number;
  healerSlots?: number;
  dpsSlots?: number;
  plannedBosses?: string[];
  roleSpecSlots?: RaidRoleSpecSlot[];
  softresLocked?: boolean;
  signupsLocked?: boolean;
}
