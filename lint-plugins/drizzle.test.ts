import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { enforceDeleteWithWhere, enforceUpdateWithWhere } from "./drizzle.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const options = [{ drizzleObjectName: ["db", "ctx.db"] }];

ruleTester.run("enforce-delete-with-where", enforceDeleteWithWhere, {
  valid: [
    { code: "db.delete(secrets).where(eq(secrets.id, id));", options },
    { code: "await ctx.db.delete(secrets).where(lt(a, b));", options },
    {
      code: "db.delete(secrets).where(eq(secrets.id, id)).returning();",
      options,
    },
    { code: "map.delete(key);", options },
  ],
  invalid: [
    {
      code: "db.delete(secrets);",
      options,
      errors: [{ messageId: "missingWhere" }],
    },
    {
      code: "await ctx.db.delete(secrets).returning();",
      options,
      errors: [{ messageId: "missingWhere" }],
    },
  ],
});

ruleTester.run("enforce-update-with-where", enforceUpdateWithWhere, {
  valid: [
    {
      code: "db.update(secrets).set({ viewCount: 1 }).where(eq(secrets.id, id));",
      options,
    },
    { code: "store.update(value);", options },
  ],
  invalid: [
    {
      code: "ctx.db.update(secrets).set({ viewCount: 1 });",
      options,
      errors: [{ messageId: "missingWhere" }],
    },
  ],
});
