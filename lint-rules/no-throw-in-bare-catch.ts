import type { Rule } from "@oxlint/plugins";

export const noThrowInBareCatch: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Forbid `throw` in a `catch` clause without a binding." },
    messages: {
      bareCatchThrows:
        "This `catch` throws without looking at the error, so every error becomes this one. Bind the error (`catch (error)`), check for the expected case, throw for that case and rethrow the rest, like `realPathOrNotFound`.",
    },
  },
  createOnce(context) {
    // One entry per enclosing catch clause or function, innermost last. A throw only
    // counts when the innermost one is a bare catch: a function defines its own flow.
    const scopes: boolean[] = [];
    const enterFunction = () => scopes.push(false);
    const exitScope = () => scopes.pop();

    return {
      CatchClause: (clause) => scopes.push(clause.param === null),
      "CatchClause:exit": exitScope,
      FunctionDeclaration: enterFunction,
      "FunctionDeclaration:exit": exitScope,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitScope,
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitScope,
      ThrowStatement(statement) {
        if (scopes.at(-1) === true)
          context.report({ node: statement, messageId: "bareCatchThrows" });
      },
    };
  },
};
