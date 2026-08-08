import type { ValueTransformer } from "typeorm";

// pg returns DECIMAL columns as strings (to avoid float precision loss);
// better-sqlite3 returns them as numbers. Normalize to `number` everywhere so
// the renderer's `.toLocaleString("en-IN")` money formatting never breaks
// depending on which side of a hybrid setup the row came from.
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) => {
    if (value === null || value === undefined) return null;
    return typeof value === "number" ? value : parseFloat(value);
  },
};
