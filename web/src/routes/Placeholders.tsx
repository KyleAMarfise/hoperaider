import { useLocation } from "react-router-dom";

export function HomePlaceholder() {
  return (
    <div className="scroll-parchment">
      <div className="scroll-parchment-inner">
        <div className="scroll-title-row">
          <h2 className="scroll-title">Hope Raid Tracker</h2>
        </div>
        <hr className="scroll-divider" />
        <p className="schedule-empty">
          The signup page is being rebuilt in React. The <strong>⚔️ Raid Strategy</strong> page is live —
          use the nav above.
        </p>
      </div>
    </div>
  );
}

export function ComingSoon() {
  const { pathname } = useLocation();
  return (
    <div className="scroll-parchment">
      <div className="scroll-parchment-inner">
        <div className="scroll-title-row">
          <h2 className="scroll-title">Coming soon</h2>
        </div>
        <hr className="scroll-divider" />
        <p className="schedule-empty">
          <code>{pathname}</code> is being rebuilt in React. It still works on the current live site for now.
        </p>
      </div>
    </div>
  );
}
