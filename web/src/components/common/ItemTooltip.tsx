import { createContext, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { buildTooltipMap, loadLootData, wowheadUrl, type LootData, type LootItem } from "../../lib/loot";

type HoverProps = {
  onMouseEnter: (e: MouseEvent) => void;
  onMouseMove: (e: MouseEvent) => void;
  onMouseLeave: () => void;
};
interface Ctx {
  hoverPropsForItemId: (itemId?: number | string | null) => HoverProps;
}

const NOOP: HoverProps = { onMouseEnter: () => {}, onMouseMove: () => {}, onMouseLeave: () => {} };
const ItemTooltipContext = createContext<Ctx>({ hoverPropsForItemId: () => NOOP });

export function useItemTooltipCtx() {
  return useContext(ItemTooltipContext);
}

// Loads the loot table once, then provides Wowhead-style hover tooltips for any
// item id. Wrap a subtree; spread hoverPropsForItemId(id) onto hoverable elements.
// Same look as the Soft Reserves page tooltip.
export function ItemTooltipProvider({ children }: { children: ReactNode }) {
  const [lootData, setLootData] = useState<LootData | null>(null);
  useEffect(() => {
    void loadLootData().then(setLootData);
  }, []);
  const tooltipMap = useMemo(() => buildTooltipMap(lootData), [lootData]);
  const [tt, setTt] = useState<{ item: LootItem; x: number; y: number } | null>(null);

  const hoverPropsForItemId = (itemId?: number | string | null): HoverProps => {
    const item = itemId != null ? tooltipMap.get(Number(itemId)) : undefined;
    if (!item?.wowheadTooltip) return NOOP;
    return {
      onMouseEnter: (e: MouseEvent) => setTt({ item, x: e.clientX, y: e.clientY }),
      onMouseMove: (e: MouseEvent) => setTt((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t)),
      onMouseLeave: () => setTt(null)
    };
  };

  return (
    <ItemTooltipContext.Provider value={{ hoverPropsForItemId }}>
      {children}
      {tt?.item.wowheadTooltip && (
        <div
          className="wow-tooltip"
          style={{
            left: Math.min(tt.x + 16, window.innerWidth - 360),
            top: Math.min(tt.y + 16, window.innerHeight - 260)
          }}
          dangerouslySetInnerHTML={{
            __html: `<div class="wow-tt-wowhead-body">${tt.item.wowheadTooltip}</div><div class="wow-tt-line wow-tt-wowhead"><a href="${wowheadUrl(
              tt.item.itemId
            )}" target="_blank" rel="noopener noreferrer">View on Wowhead ↗</a></div>`
          }}
        />
      )}
    </ItemTooltipContext.Provider>
  );
}
