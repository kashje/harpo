/**
 * Oxlint JS plugin that enforces `.where(...)` on Drizzle `delete` and `update`
 * queries, so a missing filter can't wipe or rewrite a whole table.
 *
 * Port of `eslint-plugin-drizzle`'s two rules without its dependency on the
 * ESLint / typescript-eslint toolchain.
 *
 * Options: `{ drizzleObjectName: string | string[] }`. The name is matched
 * against the object the query is called on (`db` matches `db.delete()` and
 * `ctx.db.delete()`). An empty array matches every object.
 */
import { definePlugin, defineRule } from "@oxlint/plugins";

/**
 * @typedef {import("@oxlint/plugins").ESTree.Node} Node
 * @typedef {import("@oxlint/plugins").ESTree.Expression} Expression
 * @typedef {import("@oxlint/plugins").ESTree.MemberExpression} MemberExpression
 * @typedef {import("@oxlint/plugins").ESTree.CallExpression} CallExpression
 * @typedef {import("@oxlint/plugins").Options} RuleOptions
 */

/**
 * @param {MemberExpression} member
 * @returns {string | undefined}
 */
const getPropertyName = (member) =>
  !member.computed && member.property.type === "Identifier"
    ? member.property.name
    : undefined;

/**
 * Name of the object a query method is called on: `db` for `db.delete`,
 * `ctx.db.delete` and `getDb().delete`.
 *
 * @param {Expression} object
 * @returns {string | undefined}
 */
const getReceiverName = (object) => {
  if (object.type === "Identifier") return object.name;
  if (object.type === "MemberExpression") return getPropertyName(object);
  if (object.type === "CallExpression") {
    const callee = object.callee;
    if (callee.type === "Identifier") return callee.name;
    if (callee.type === "MemberExpression") return getPropertyName(callee);
  }
  return undefined;
};

/**
 * @param {MemberExpression} member
 * @param {Readonly<RuleOptions>} options
 */
const isDrizzleReceiver = (member, options) => {
  const name = getReceiverName(member.object);
  if (!name) return false;

  const [firstOption] = options;
  const allowed =
    firstOption &&
    typeof firstOption === "object" &&
    "drizzleObjectName" in firstOption
      ? firstOption.drizzleObjectName
      : [];

  if (typeof allowed === "string") return name === allowed;
  if (!Array.isArray(allowed)) return false;
  return allowed.length === 0 || allowed.includes(name);
};

/**
 * Whether a `.where(...)` call follows `call` in the same method chain.
 *
 * @param {CallExpression} call
 */
const chainHasWhere = (call) => {
  /** @type {Node} */
  let current = call;
  while (
    current.parent?.type === "MemberExpression" &&
    current.parent.object === current
  ) {
    /** @type {MemberExpression} */
    const member = current.parent;
    if (getPropertyName(member) === "where") return true;
    if (member.parent.type !== "CallExpression") return false;
    current = member.parent;
  }
  return false;
};

/**
 * @param {"delete" | "update"} method
 * @param {string} message
 */
const createWhereRule = (method, message) =>
  defineRule({
    meta: {
      type: "problem",
      docs: {
        description: `Enforce that \`${method}\` is used with \`where\` so it can't affect every row in a table.`,
      },
      messages: { missingWhere: message },
      schema: [
        {
          type: "object",
          properties: {
            drizzleObjectName: { type: ["string", "array"] },
          },
          additionalProperties: false,
        },
      ],
    },
    create: (context) => ({
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          getPropertyName(callee) !== method ||
          !isDrizzleReceiver(callee, context.options)
        ) {
          return;
        }

        if (!chainHasWhere(node)) {
          context.report({
            node: callee,
            messageId: "missingWhere",
            data: {
              drizzleObjName: context.sourceCode.getText(callee.object),
            },
          });
        }
      },
    }),
  });

export const enforceDeleteWithWhere = createWhereRule(
  "delete",
  "Without `.where(...)` you will delete all the rows in a table. If you didn't want to do it, please use `{{ drizzleObjName }}.delete(...).where(...)` instead. Otherwise you can ignore this rule here",
);

export const enforceUpdateWithWhere = createWhereRule(
  "update",
  "Without `.where(...)` you will update all the rows in a table. If you didn't want to do it, please use `{{ drizzleObjName }}.update(...).set(...).where(...)` instead. Otherwise you can ignore this rule here",
);

export default definePlugin({
  meta: { name: "drizzle" },
  rules: {
    "enforce-delete-with-where": enforceDeleteWithWhere,
    "enforce-update-with-where": enforceUpdateWithWhere,
  },
});
