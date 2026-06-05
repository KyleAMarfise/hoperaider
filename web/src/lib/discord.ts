// Fire-and-forget Discord webhook on new signup — ported from js/app.js.
import { appSettings } from "./config";

const ROLE_EMOJI: Record<string, string> = { Tank: "🛡️", Healer: "⚕️", DPS: "⚔️" };

export function sendDiscordSignupNotification(
  payload: { profileCharacterName?: string; raidName?: string; raidDate?: string; status?: string },
  characterEntry: { characterName?: string; wowClass?: string; mainSpecialization?: string; mainRole?: string; role?: string }
): void {
  const webhookUrl = appSettings.discordWebhookUrl;
  if (!webhookUrl) return;

  const charName = characterEntry?.characterName || payload.profileCharacterName || "Unknown";
  const charClass = characterEntry?.wowClass || "";
  const mainSpec = characterEntry?.mainSpecialization || "";
  const role = characterEntry?.mainRole || characterEntry?.role || "";
  const roleEmoji = ROLE_EMOJI[role] || "👤";
  const raidName = payload.raidName || "a raid";
  const raidDate = payload.raidDate || "";
  const status = payload.status || "requested";

  const description = [
    `${roleEmoji} **${charName}**` + (mainSpec || charClass ? ` (${[mainSpec, charClass].filter(Boolean).join(" ")})` : ""),
    `wants to join **${raidName}**` + (raidDate ? ` on ${raidDate}` : ""),
    status === "requested" ? "_Awaiting admin approval_" : `_Status: ${status}_`
  ].join("\n");

  const body = JSON.stringify({
    embeds: [
      {
        title: "New Raid Signup Request",
        description,
        color: status === "requested" ? 0xf0b232 : 0x43b581,
        timestamp: new Date().toISOString()
      }
    ]
  });

  fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
}
