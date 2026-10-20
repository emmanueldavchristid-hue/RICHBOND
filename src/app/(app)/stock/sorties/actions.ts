"use server";

import { revalidatePath } from "next/cache";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import {
  cancelIssue,
  cancelIssueSchema,
  createIssue,
  createIssueSchema,
  getIssue,
  issueIdSchema,
  listIssues,
  listIssuesSchema,
  searchIssueItems,
  searchIssueItemsSchema,
} from "@/modules/stock";

/** Server actions des bons de sortie (LOT-07) : session, droit, licence (écriture), Zod, audit via le service. */
const READ = { writable: false } as const;
const at = async () => (await getNow()).now;
const touch = (id?: string) => {
  revalidatePath("/stock");
  revalidatePath("/stock/sorties");
  revalidatePath("/stock/mouvements");
  revalidatePath("/stock/articles");
  if (id) revalidatePath(`/stock/sorties/${id}`);
};

export const createIssueAction = withAction("stock.issue", createIssueSchema, async ({ user, input }) => {
  const r = await createIssue(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

/** Contre-passation d'un bon de sortie (Responsable). */
export const cancelIssueAction = withAction("stock.adjust", cancelIssueSchema, async ({ user, input }) => {
  const r = await cancelIssue(user, input, await getClientIp(), await at());
  touch(r.id);
  return r;
});

export const searchIssueItemsAction = withAction("stock.issue", searchIssueItemsSchema, ({ user, input }) => searchIssueItems(user, input), READ);
export const listIssuesAction = withAction("stock.view", listIssuesSchema, ({ user, input }) => listIssues(user, input), READ);
export const getIssueAction = withAction("stock.view", issueIdSchema, ({ user, input }) => getIssue(user, input), READ);
