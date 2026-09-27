/** Result of {@link validateName}: valid, or invalid with why not. */
export type NameValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

/**
 * Validates a workshop, file or folder name. Used by `host` to reject `InvalidName`,
 * and reused by `app` for live validation as the user types.
 */
export function validateName(name: string): NameValidation {
  if (name === "") return { valid: false, reason: "The name can't be empty." };
  if (name.includes("/")) return { valid: false, reason: 'The name can\'t contain "/".' };
  if (name.includes("\0"))
    return { valid: false, reason: "The name can't contain a NUL character." };
  if (name === "." || name === "..") {
    return { valid: false, reason: `The name can't be "${name}".` };
  }
  return { valid: true };
}
