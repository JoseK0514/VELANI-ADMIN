import { expect, it } from "vitest";
import { qualifyHealth, lifecycleMetrics } from "../src/server/business/health";
const now = Date.parse("2026-11-13T16:00:00Z");
const workplace = {
  id: "owned",
  environment: "test",
  incarnation: "2",
  revision: "3",
  origin: "https://owned.example.invalid",
  createdAt: "2026-11-01T16:00:00Z",
};
const health = {
  sourceId: "owned",
  incarnation: "2",
  sourceRevision: "3",
  origin: workplace.origin,
  stage: "paid",
  stageSince: "2026-11-05T16:00:00Z",
  setupComplete: true,
  firstUsedAt: "2026-11-02T16:00:00Z",
  trialStartedAt: "2026-11-01T16:00:00Z",
  paidStartedAt: "2026-11-05T16:00:00Z",
  workerState: "healthy",
  workerObservedAt: "2026-11-13T15:59:00Z",
};
it("requires current workplace identity and fresh observations before showing healthy or setup complete", () => {
  expect(
    qualifyHealth([health], { state: "ready" }, [workplace], "test", now)[0],
  ).toMatchObject({
    qualified: true,
    workerState: "healthy",
    setupComplete: true,
  });
  for (const w of [
    { ...workplace, revision: "4" },
    { ...workplace, incarnation: "3" },
    { ...workplace, origin: "https://other.example.invalid" },
    { ...workplace, environment: "staging" },
  ])
    expect(
      qualifyHealth([health], { state: "ready" }, [w], "test", now)[0],
    ).toMatchObject({
      qualified: false,
      stage: "unknown",
      setupComplete: null,
      workerState: "unknown",
    });
  expect(
    qualifyHealth([health], { state: "stale" }, [workplace], "test", now)[0]
      .workerState,
  ).toBe("unknown");
  expect(
    qualifyHealth(
      [{ ...health, workerObservedAt: "2026-11-13T15:30:00Z" }],
      { state: "ready" },
      [workplace],
      "test",
      now,
    )[0].workerState,
  ).toBe("unknown");
});
it("compares source-recorded lifecycle cohorts without inventing lifetime retention", () => {
  const items = qualifyHealth(
    [health],
    { state: "ready" },
    [workplace],
    "test",
    now,
  );
  expect(lifecycleMetrics(items, "2026-11-01", "2026-11-13")).toMatchObject({
    activated: 1,
    trialsStarted: 1,
    convertedTrials: 1,
    paidStarted: 1,
    medianHoursToActivation: 24,
    historicalRetentionRate: null,
  });
  expect(
    lifecycleMetrics(
      qualifyHealth([health], { state: "stale" }, [workplace], "test", now),
      "2026-11-01",
      "2026-11-13",
    ).observedWorkplaces,
  ).toBe(0);
});
