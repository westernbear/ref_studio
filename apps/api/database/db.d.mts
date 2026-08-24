import type Database from "better-sqlite3";
import type { PathLike } from "node:fs";

export function defaultDatabasePath(): string;
export function findRootEnv(start?: string): string;
export function loadSeedEnv(
  file?: PathLike,
  base?: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined>;
export function openDatabase(file?: string): Database.Database;
export function migrate(db: Database.Database): void;
export function seed(
  db: Database.Database,
  env?: Readonly<Record<string, string | undefined>>,
): void;
