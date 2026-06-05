import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../lib/firebase";
import { appSettings } from "../../lib/config";
import { cx } from "../../lib/formatters";
import { useCollection } from "../../hooks/useCollection";
import { ProfileMenu } from "./ProfileMenu";
import { RaidClock } from "./RaidClock";

// Real WoW icon art served from Wowhead's CDN.
const wowIcon = (name: string) => `https://wow.zamimg.com/images/wow/icons/large/${name}.jpg`;

const discordIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M19.54 4.53A16.86 16.86 0 0 0 15.49 3c-.18.32-.4.75-.55 1.09a15.58 15.58 0 0 0-5.88 0c-.16-.34-.37-.77-.56-1.09a16.79 16.79 0 0 0-4.06 1.54C1.92 8.38 1.24 12.14 1.58 15.85A17 17 0 0 0 6.56 18.4c.4-.55.76-1.14 1.06-1.76a10.95 10.95 0 0 1-1.67-.8c.14-.1.28-.22.42-.33a12.03 12.03 0 0 0 11.25 0c.14.12.28.23.42.33-.53.31-1.09.58-1.68.8.31.62.66 1.21 1.06 1.76a16.94 16.94 0 0 0 4.99-2.55c.4-4.3-.68-8.02-2.87-11.32ZM8.96 13.58c-.9 0-1.63-.82-1.63-1.84 0-1.01.72-1.84 1.63-1.84.91 0 1.64.83 1.63 1.84 0 1.02-.72 1.84-1.63 1.84Zm6.08 0c-.9 0-1.63-.82-1.63-1.84 0-1.01.72-1.84 1.63-1.84.91 0 1.64.83 1.63 1.84 0 1.02-.72 1.84-1.63 1.84Z" />
  </svg>
);

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Signup", icon: "inv_misc_groupneedmore", end: true },
  { to: "/schedule", label: "Schedule", icon: "inv_misc_pocketwatch_01" },
  { to: "/strategy", label: "Strategy", icon: "inv_misc_map_01" },
  { to: "/softres", label: "Reserves", icon: "inv_misc_coinbag_special" },
  { to: "/releases", label: "Releases", icon: "inv_misc_book_11" }
];

// Admin pages — grouped on the right; greyed (and route-protected) for non-admins.
const ADMIN_ITEMS: NavItem[] = [
  { to: "/raids", label: "Raids", icon: "inv_bannerpvp_02" },
  { to: "/admin", label: "Requests", icon: "inv_letter_15" }
];

interface Bag {
  icon: string;
  name: string;
  joke?: string;
  jokes?: string[]; // a bag can hold several roasts in one popover
}
// WoW's default backpack — rendered on the far RIGHT (like in-game). The fancier
// bags (Netherweave, etc.) sit to its left.
const MAIN_BAG: Bag = {
  icon: "inv_misc_bag_08",
  name: "Backpack",
  joke: "Philfestive's Backpack — our holy pally whose heals are festive but whose mana bar is a rumor. Bubble-hearths at 2%, beacons the tank he isn't watching, and calls healing himself 'triage.' The HoTs are merry; the wipes are bright."
};
const EXTRA_BAGS: Bag[] = [
  {
    // Far-left bag — stuffed with roasts.
    icon: "inv_misc_bag_27",
    name: "Bag of Shame",
    jokes: [
      "Duglet, our bear 'tank': 16 slots, zero threat. Shifts to bear, loses the boss to the mage, then growls at the healers like it's their fault. Still gemmed +spell damage 'in case I go boomkin.'",
      "Stinted, hunter: the pet does the damage, Stinted does the dying. Feigns Death so convincingly we forget he's in the raid — which is fair, his DPS already left.",
      "shadyroamer, warlock: would rather watch you corpse-run for ten minutes than spend a single Soul Shard. Zero soulstones, infinite excuses, hearthstone set to 'not my problem.'",
      "And the bench warmers: six slots' worth of DPS, raid awareness, and the other four reasons you're not in the raid."
    ]
  },
  {
    icon: "inv_misc_bag_29",
    name: "Imbued Netherweave Bag",
    joke: "Mariozelda's Bag — fury warrior, all gas no brakes. Whirlwinds into three packs, slams 'It's-a-me!' on Recount, then needs a rescue from the healers like a captured princess. Parses purple, dies orange."
  },
  {
    icon: "inv_misc_bag_14",
    name: "Runecloth Bag",
    joke: "Onore's Bag — warlock who lets the felguard do the heavy lifting while he Life Taps into a wipe. Ask for a Healthstone, get a Ritual of Doom. Somehow always the last one alive AND the reason nobody else is."
  }
];

function BagBar() {
  const [collapsed, setCollapsed] = useState(false);
  const [openBag, setOpenBag] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenBag(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // Extras to the left, main backpack on the right; collapsed → backpack only.
  const bags = collapsed ? [MAIN_BAG] : [...EXTRA_BAGS, MAIN_BAG];

  return (
    <div className="wow-bags" ref={ref}>
      <button
        type="button"
        className="wow-bag-collapse"
        title={collapsed ? "Expand bags" : "Collapse bags"}
        onClick={(e) => {
          e.stopPropagation();
          setCollapsed((c) => !c);
          setOpenBag(null);
        }}
      >
        {collapsed ? "‹" : "›"}
      </button>
      {bags.map((b) => (
        <div className="wow-bag-wrap" key={b.icon}>
          <button
            type="button"
            className={cx("wow-action-slot wow-bag-slot", openBag === b.icon && "is-active")}
            title={b.name}
            onClick={(e) => {
              e.stopPropagation();
              setOpenBag((o) => (o === b.icon ? null : b.icon));
            }}
          >
            <img className="wow-action-icon-img" src={wowIcon(b.icon)} alt={b.name} loading="lazy" />
          </button>
          {openBag === b.icon && (
            <div className="wow-bag-popover">
              <span className="wow-bag-popover-title">📦 {b.name}</span>
              {b.jokes ? b.jokes.map((j, i) => <p className="wow-bag-joke" key={i}>{j}</p>) : b.joke}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Nav() {
  const { isAdmin } = useAuth();

  // Pending signup-request count → indicator badge on the Requests slot (admins).
  const pendingQuery = useMemo(
    () => (isAdmin ? query(collection(db, "signups"), where("status", "==", "requested")) : null),
    [isAdmin]
  );
  const { docs: pendingSignups } = useCollection(pendingQuery);
  const pendingCount = pendingSignups.length;

  return (
    <div className="wow-nav">
      <div className="wow-nav-top">
        <div className="brand wow-unit-frame">
          <div className="unit-portrait">
            <img className="brand-icon" src="/assets/images/wow-alliance.png" alt="Alliance crest" />
            <div className="unit-portrait-ring"></div>
          </div>
          <div className="unit-bars">
            <div className="unit-name-row">
              <span className="unit-name">{appSettings.siteTitle}</span>
              <span className="unit-level">70</span>
            </div>
            <div className="unit-health-bar">
              <div className="unit-health-fill"></div>
            </div>
            <div className="unit-mana-bar">
              <div className="unit-mana-fill"></div>
            </div>
          </div>
        </div>

        <RaidClock />
      </div>

      <div className="wow-bar-row">
        <nav className="wow-actionbar" aria-label="Primary navigation">
          {NAV_ITEMS.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => cx("wow-action-slot", isActive && "is-active")}
            >
              <img className="wow-action-icon-img" src={wowIcon(it.icon)} alt="" loading="lazy" />
              <span className="wow-action-label">{it.label}</span>
            </NavLink>
          ))}

          <span className="wow-bar-divider" aria-hidden="true" />

          {ADMIN_ITEMS.map((it) =>
            isAdmin ? (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) => cx("wow-action-slot", isActive && "is-active")}
              >
                <img className="wow-action-icon-img" src={wowIcon(it.icon)} alt="" loading="lazy" />
                <span className="wow-action-label">{it.label}</span>
                {it.to === "/admin" && pendingCount > 0 && (
                  <span className="wow-action-badge" title={`${pendingCount} pending request${pendingCount === 1 ? "" : "s"}`}>
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            ) : (
              <span
                key={it.to}
                className="wow-action-slot wow-action-locked"
                aria-disabled="true"
                title="Admins only"
              >
                <span className="wow-action-lock">🔒</span>
                <img className="wow-action-icon-img" src={wowIcon(it.icon)} alt="" loading="lazy" />
                <span className="wow-action-label">{it.label}</span>
              </span>
            )
          )}

          <span className="wow-bar-divider" aria-hidden="true" />

          <a
            className="wow-action-slot wow-action-discord"
            href={appSettings.discordInviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Guild Discord"
          >
            <span className="wow-action-icon">{discordIcon}</span>
            <span className="wow-action-label">Discord</span>
          </a>

          <div className="wow-action-slot wow-action-profile">
            <ProfileMenu />
            <span className="wow-action-label">Account</span>
          </div>

          <BagBar />
        </nav>
      </div>
    </div>
  );
}
