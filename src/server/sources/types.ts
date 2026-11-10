import type { SourceName } from "../config";
export type Item = Record<string, unknown> & { id: string; createdAt: string };
export type SourcePage = { items: Item[]; more: boolean };
export type SourceKind =
  | "workplaces"
  | "registrations"
  | "catalog"
  | "requests";
export type Page = {
  limit: number;
  after?: { id: string; createdAt: string };
  query?: string;
  excludeIds?: string[];
};
export interface Sources {
  list(kind: SourceKind, page: Page): Promise<SourcePage>;
  get(kind: SourceKind, id: string): Promise<Item | null>;
  batch(kind: SourceKind, ids: string[]): Promise<Item[]>;
  count(kind: SourceKind, excludeIds?: string[]): Promise<number>;
}
export const sourceFor: Record<SourceKind, SourceName> = {
  workplaces: "control",
  registrations: "control",
  catalog: "catalog",
  requests: "velani",
};
