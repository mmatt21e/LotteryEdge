import { useState } from "react";
import { Sheet } from "../Sheet.js";

export function InfoSheet({ onClose }: { onClose: () => void }) {
  const [perm, setPerm] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const enableAlerts = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
  };

  return (
    <Sheet label="How LotteryEdge works" onClose={onClose}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">How LotteryEdge works</div>
            <div className="sheet-sub">Version {__APP_VERSION__}</div>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="alerts-box">
          <div>
            <strong>Change alerts</strong>
            <div className="alerts-sub">
              {perm === "granted"
                ? "On — you’ll get a notification when a favorite changes (when you open the app)."
                : perm === "unsupported"
                  ? "Notifications aren’t supported on this browser."
                  : "Get notified when a ★ favorite’s top prize is claimed or its value shifts."}
            </div>
          </div>
          {perm !== "granted" && perm !== "unsupported" && (
            <button className="add-btn" onClick={enableAlerts}>
              Enable
            </button>
          )}
        </div>

        <div className="info">
          <h4>What it measures</h4>
          <p>
            For each scratch-off, it compares the <strong>prizes still unclaimed</strong> against an
            estimate of the <strong>tickets still unsold</strong> to gauge what a ticket is worth
            right now.
          </p>

          <h4>Net / $1 spent</h4>
          <p>
            The headline number. <strong>−6.7¢ / $1</strong> means that, on average, you lose about
            7 cents per dollar. The least-negative game is the best available — but nearly all
            scratch-offs sit below break-even.
          </p>

          <h4>Odds “1 in X to profit”</h4>
          <p>
            Your chance of winning <em>more</em> than the ticket price — the honest odds, not the
            “win anything” figure (which counts break-even prizes). This uses the <em>live</em>{" "}
            odds (see below), so it moves as the game sells down.
          </p>

          <h4>Prize odds: “printed” vs “now”</h4>
          <p>
            In a game’s prize table, <strong>printed</strong> is the odds the state set at launch —
            fixed for the whole print run, it never changes. <strong>Now</strong> re-derives each
            tier’s odds from what’s left: <em>estimated tickets remaining ÷ prizes of that tier
            still unclaimed</em>. As a jackpot gets claimed, its “now” odds get longer; as low tiers
            deplete faster than tickets, theirs can shorten. Because it builds on the estimated
            ticket pool, “now” is noisier than the printed figure — treat it as a live guide, not a
            guarantee.
          </p>

          <h4>Confidence</h4>
          <p>
            The EV assumes prizes are won in proportion to tickets sold. That’s noisy for brand-new
            games (little sold) or nearly-finished ones (few left), which get a{" "}
            <strong>low</strong> tag.
          </p>

          <h4>Trends &amp; Hot sellers</h4>
          <p>
            Built from a daily snapshot. Until 2+ days are collected they show clearly-labeled{" "}
            <strong>sample</strong> data.
          </p>

          <h4>“Ending soon”</h4>
          <p>
            Most states don’t publish claim deadlines for active games, so this is a{" "}
            <em>sell-through</em> signal: a game with almost none of its print run left is winding
            down and will likely be pulled soon. It’s a heads-up, not an official date.
          </p>

          <h4>“After tax”</h4>
          <p>
            A rough estimate: 24% federal withholding on prizes of $5,000+, plus the game’s own
            state’s tax on prizes of $600+ (zero in no-income-tax states and California). Actual
            taxes depend on your situation — this is a comparison aid, not tax advice.
          </p>

          <h4>The estimate isn’t a promise</h4>
          <p>
            States don’t publish “tickets remaining,” so it’s derived. Great for ranking — never a
            guarantee of winning.
          </p>

          <div className="rg">
            <strong>Play responsibly.</strong> This tool finds the least-bad odds; it can’t make
            the lottery profitable. If gambling stops being fun, call{" "}
            <a href="tel:18004262537">1-800-GAMBLER</a> (free, confidential, 24/7).
          </div>
        </div>
    </Sheet>
  );
}
