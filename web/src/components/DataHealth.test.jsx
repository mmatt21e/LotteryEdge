import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { DataHealth } from "./DataHealth";
import { prepareSnapshot } from "../dataQuality";

describe("rendered feed-health text", () => {
  it("renders all-excluded collection as unavailable and retains the reason", () => {
    const at = "2026-10-17T11:00:00Z";
    const view = prepareSnapshot({state: "ia", source: "official", generatedAt: at, gameCount: 0, games: [], excluded: [{gameId: "1", name: "Fixture", reason: "Complete prize ladder unavailable"}]}, {generatedAt: at, states: [{state: "ia", ok: true}]}, [], Date.parse(at));
    const html = renderToStaticMarkup(<DataHealth data={view}/>);
    expect(html).toContain("IA: Current comparison unavailable");
    expect(html).toContain("completed (usability checked separately)");
    expect(html).toContain("1 source records; 0 passed validation; 1 excluded by validation");
    expect(html).toContain("Complete prize ladder unavailable");
    expect(html).not.toContain("Source meets freshness rules");
  });
});
