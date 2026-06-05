import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { collection, query, where } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../lib/firebase";
import { appSettings } from "../../lib/config";
import { cx } from "../../lib/formatters";
import { isActiveSignup } from "../../lib/admin";
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
  special?: boolean; // extra-fancy treatment (Stinted's quiver)
}
// WoW's default backpack — rendered on the far RIGHT (like in-game). The fancier
// bags (Netherweave, etc.) sit to its left.
const MAIN_BAG: Bag = {
  icon: "inv_misc_bag_08",
  name: "Backpack",
  joke: "Philfestive's Backpack — our holy pally and fearless Guild Master, who runs the raid like he runs his mana bar: generously, and straight into the ground. Spams Flash of Light to empty by the second pull, the Holy Light lands sometime next Tuesday, and his idea of triage is Divine Shield → Hearthstone. Cleanses the wrong target but blesses everyone on the way out. The Blessings are festive; the wipes are bright. GM perks: first to call the pull, first to stand in it. …all that said, Phil's still nasty. (The good kind.)"
};
const EXTRA_BAGS: Bag[] = [
  {
    // Far-left bag — stuffed with roasts.
    icon: "inv_misc_bag_27",
    name: "Bag of Shame",
    jokes: [
      "Duglet, our bear 'tank': 16 slots, zero threat. Shifts to bear, loses the boss to the mage, then growls at the healers like it's their fault. Still gemmed +spell damage 'in case I go boomkin.' …but real talk, Duglet's still a badass.",
      "shadyroamer, warlock: would rather watch you corpse-run for ten minutes than spend a single Soul Shard. Zero soulstones, infinite excuses, hearthstone set to 'not my problem.' …that said, shadyroamer's still our undisputed Loot King. 👑"
    ]
  },
  {
    icon: "inv_misc_bag_29",
    name: "Imbued Netherweave Bag",
    joke: "Mariozelda's Bag — fury warrior, all gas no brakes. Whirlwinds into three packs, slams 'It's-a-me!' on Recount, then needs a rescue from the healers like a captured princess. Parses purple, dies orange. …still, the man's funny as hell."
  },
  {
    icon: "inv_misc_bag_14",
    name: "Runecloth Bag",
    joke: "Onore's Bag — affliction 'lock who blankets the boss in Corruption, Curse of Agony, and Unstable Affliction, then alt-tabs while the DoTs do the work. UA dispels for more damage than his Shadow Bolts land. Life Taps to 5%, blames the healers, and Drains Soul off the trash so you don't even get a Healthstone. Somehow always the last one alive AND the reason nobody else is. …and let's be honest — Onore's still sexy."
  }
];
// Stinted demanded his own container — a hunter deserves a quiver, not a shared
// Bag of Shame. Sits on the far left, with the dressed-up roast inside.
const QUIVER: Bag = {
  icon: "inv_misc_quiver_06",
  name: "Stinted's Personal Quiver",
  special: true,
  joke:
    "✨🏹 By royal decree of Stinted himself — for a mere Bag of Shame could not contain such majesty — behold his very own quiver. 👑✨ " +
    "Presenting Stinted: Hunter, Lord of the Misdirect, Baron of Feign Death, Keeper of 1,000 arrows (give or take 997 that missed). " +
    "The pet does the damage; Stinted does the dying — vanishing mid-pull so convincingly we forget he's in the raid, which is fair, his DPS already left. " +
    "Truly, a legend in his own mind. He asked to be special, so… here's his special little quiver. Punk. 🏹✨"
};

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

  // Stinted's quiver on the far left, then the cloth bags, then the backpack on the
  // far right; collapsed → backpack only.
  const bags = collapsed ? [MAIN_BAG] : [QUIVER, ...EXTRA_BAGS, MAIN_BAG];

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
            className={cx("wow-action-slot wow-bag-slot", b.special && "wow-bag-quiver", openBag === b.icon && "is-active")}
            title={b.name}
            onClick={(e) => {
              e.stopPropagation();
              setOpenBag((o) => (o === b.icon ? null : b.icon));
            }}
          >
            <img className="wow-action-icon-img" src={wowIcon(b.icon)} alt={b.name} loading="lazy" />
          </button>
          {openBag === b.icon && (
            <div className={cx("wow-bag-popover", b.special && "wow-bag-popover-special")}>
              <span className="wow-bag-popover-title">
                {b.special ? "🏹" : "📦"} {b.name}
              </span>
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
  // Only count requests for raids that haven't happened yet — stale "requested"
  // signups on past raids were inflating the badge.
  const pendingCount = useMemo(() => pendingSignups.filter((s) => isActiveSignup(s as any)).length, [pendingSignups]);

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
