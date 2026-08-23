declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options?: { readonly recursive?: boolean },
  ): Promise<string | undefined>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function writeFile(path: string, data: string): Promise<void>;
}

declare module "node:path" {
  export function resolve(...paths: string[]): string;
}

declare const process: {
  readonly cwd: () => string;
  readonly env: Readonly<Record<string, string | undefined>>;
};
