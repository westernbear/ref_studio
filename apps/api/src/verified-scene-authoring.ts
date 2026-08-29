export async function generateVerifiedScene<T>(options: {
  readonly generate: (
    attempt: number,
    failures: readonly string[],
  ) => Promise<unknown>;
  readonly verify: (candidate: unknown) => T;
}): Promise<T> {
  let failures: readonly string[] = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return options.verify(await options.generate(attempt, failures));
    } catch (error) {
      failures = [error instanceof Error ? error.message : "SCENE_INVALID"];
    }
  }
  throw new Error(`SCENE_VERIFICATION_FAILED: ${failures.join("; ")}`);
}
