import type { ESTree, Rule } from "@oxlint/plugins";

// Electron's secure defaults, and the value that turns each one off.
// https://www.electronjs.org/docs/latest/tutorial/security
const unsafeValues: ReadonlyMap<string, boolean> = new Map([
  ["nodeIntegration", true],
  ["contextIsolation", false],
  ["sandbox", false],
  ["webSecurity", false],
  ["allowRunningInsecureContent", true],
]);

function keyName(property: ESTree.ObjectProperty): string | undefined {
  const { key } = property;
  if (key.type === "Identifier" && !property.computed) return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return undefined;
}

export const electronSecurity: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Forbid turning off Electron's secure defaults." },
    messages: {
      unsafe:
        "`{{name}}: {{value}}` turns off an Electron security default. Keep the default and expose what the renderer needs through the preload.",
    },
  },
  createOnce(context) {
    return {
      ObjectExpression(object) {
        for (const property of object.properties) {
          if (property.type !== "Property") continue;
          const name = keyName(property);
          if (name === undefined) continue;
          const unsafe = unsafeValues.get(name);
          const { value } = property;
          if (value.type === "Literal" && value.value === unsafe) {
            context.report({
              node: property,
              messageId: "unsafe",
              data: { name, value: String(unsafe) },
            });
          }
        }
      },
    };
  },
};
