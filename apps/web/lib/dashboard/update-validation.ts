import { z } from "zod";
import type { UpdateCategory } from "@pdc/shared-types";

const UPDATE_CATEGORIES: [UpdateCategory, ...UpdateCategory[]] = ["additive", "correction", "expansion", "methodology_change"];

/**
 * Declare-update wizard (Session 18, Deliverable 4) validation. Excludes
 * 'initial_certification' — that category is only ever written by the
 * (separate, pre-existing) certificate issuance flow, never by a provider
 * declaring a change to an already-certified endpoint.
 */
export const declareUpdateSchema = z.object({
  updateCategory: z.enum(UPDATE_CATEGORIES, { required_error: "Please select an update category" }),
  changeDescription: z
    .string()
    .trim()
    .min(20, "Please describe your update in at least 20 characters — this is shown to buyers and agents")
    .max(500, "Description must be 500 characters or fewer"),
  recordsAdded: z.coerce.number().int().min(0).optional(),
  recordsModified: z.coerce.number().int().min(0).optional(),
  recordsRemoved: z.coerce.number().int().min(0).optional(),
  newParameters: z.array(z.string().trim().min(1)).default([]),
  dateRangeExtended: z.boolean().default(false),
});

export type DeclareUpdateInput = z.infer<typeof declareUpdateSchema>;

export const confirmUpdateSchema = z.object({
  newHash: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, "Must be a 64-character hex SHA-256 hash — copy it exactly from your /integrity route"),
});

export type ConfirmUpdateInput = z.infer<typeof confirmUpdateSchema>;
