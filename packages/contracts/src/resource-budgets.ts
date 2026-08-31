/**
 * Canonical motion resource budgets shared by API, worker, package, and Adobe
 * boundaries. Callers must fail closed before mutation when a budget is exceeded.
 */
export const RESOURCE_BUDGETS = {
  maxSceneElements: 256,
  maxSceneOperations: 64,
  maxFrameCount: 900,
  maxPackageBytes: 512 * 1024 * 1024,
  maxFfmpegOutputBytes: 2 * 1024 * 1024 * 1024,
  maxBlenderTriangles: 250_000,
  maxSpoolFileBytes: 1_048_576,
  maxRelayBodyBytes: 262_144,
} as const;

export type ResourceBudgetKey = keyof typeof RESOURCE_BUDGETS;

export class ResourceBudgetError extends Error {
  override readonly name = "ResourceBudgetError";
  constructor(
    readonly budget: ResourceBudgetKey,
    readonly observed: number,
  ) {
    super("RESOURCE_BUDGET_EXCEEDED");
  }
}

export const assertResourceBudget = (
  budget: ResourceBudgetKey,
  observed: number,
): void => {
  const limit = RESOURCE_BUDGETS[budget];
  if (observed > limit) throw new ResourceBudgetError(budget, observed);
};
