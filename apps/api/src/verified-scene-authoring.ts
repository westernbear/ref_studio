export async function generateVerifiedScene<T>(options: {
  readonly generate: (
    attempt: number,
    failures: readonly string[],
  ) => Promise<unknown>;
  readonly verify: (candidate: unknown) => T;
}): Promise<{
  readonly value: T;
  readonly attempts: number;
  readonly failures: readonly string[];
}> {
  let failures: readonly string[] = [];
  const failureHistory: string[] = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return {
        value: options.verify(await options.generate(attempt, failures)),
        attempts: attempt,
        failures: failureHistory,
      };
    } catch (error) {
      failures = [error instanceof Error ? error.message : "SCENE_INVALID"];
      failureHistory.push(...failures);
    }
  }
  throw new Error(`SCENE_VERIFICATION_FAILED: ${failures.join("; ")}`);
}
