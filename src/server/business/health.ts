import type { Item } from "../sources/types";
type Row = Record<string, unknown>;
export function qualifyHealth(
  items: Row[],
  feed: Row,
  workplaces: Item[],
  environment: string,
  now = Date.now(),
): (Row & { qualified: boolean; workerState: unknown })[] {
  return items.map((item) => {
    const w = workplaces.find((w) => w.id === item.sourceId);
    const identity =
      !!w &&
      w.environment === environment &&
      String(w.incarnation) === item.incarnation &&
      String(w.revision) === item.sourceRevision &&
      String(w.origin).replace(/\/$/, "") ===
        String(item.origin).replace(/\/$/, "");
    const qualified = identity && feed.state === "ready";
    const observed =
      typeof item.workerObservedAt === "string"
        ? Date.parse(item.workerObservedAt)
        : NaN;
    const workerFresh =
      qualified && observed <= now + 30_000 && now - observed <= 15 * 60000;
    return {
      ...item,
      qualified,
      registeredAt: qualified ? w?.createdAt : null,
      observedStage: item.stage,
      stage: qualified ? item.stage : "unknown",
      setupComplete: qualified ? item.setupComplete : null,
      firstUsedAt: qualified ? item.firstUsedAt : null,
      recordedWorkerState: item.workerState,
      workerState: workerFresh ? item.workerState : "unknown",
    };
  });
}

/** Cohorts in the currently retained, identity-qualified snapshot; never lifetime churn. */
export function lifecycleMetrics(items: Row[], from: string, to: string) {
  const start = Date.parse(from),
    end = Date.parse(to + "T23:59:59.999Z");
  const range = (v: unknown) =>
    typeof v === "string" && Date.parse(v) >= start && Date.parse(v) <= end;
  const qualified = items.filter((x) => x.qualified),
    trials = qualified.filter((x) => range(x.trialStartedAt));
  const activated = qualified.filter((x) => range(x.firstUsedAt));
  const durations = activated
    .filter(
      (x) =>
        x.registeredAt &&
        Date.parse(String(x.firstUsedAt)) >= Date.parse(String(x.registeredAt)),
    )
    .map(
      (x) =>
        (Date.parse(String(x.firstUsedAt)) -
          Date.parse(String(x.registeredAt))) /
        3600000,
    )
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  return {
    observedWorkplaces: qualified.length,
    activated: activated.length,
    trialsStarted: trials.length,
    convertedTrials: trials.filter(
      (x) =>
        x.paidStartedAt &&
        Date.parse(String(x.paidStartedAt)) >=
          Date.parse(String(x.trialStartedAt)),
    ).length,
    paidStarted: qualified.filter((x) => range(x.paidStartedAt)).length,
    cancellationsObserved: qualified.filter((x) => range(x.canceledAt)).length,
    activePaidNow: qualified.filter((x) => x.stage === "paid").length,
    medianHoursToActivation: durations.length
      ? Math.round(
          (durations.length % 2
            ? durations[mid]
            : (durations[mid - 1] + durations[mid]) / 2) * 10,
        ) / 10
      : null,
    historicalRetentionRate: null,
  };
}
