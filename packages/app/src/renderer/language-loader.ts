import type { LanguageSupport } from "@codemirror/language";

/** What the loader needs of a `LanguageDescription`. */
interface LoadableLanguage {
  load(): Promise<LanguageSupport>;
}

/**
 * Loads languages one request at a time, handing a language to `apply` only if no later request or `cancel`
 * came in while it loaded. Loading takes a while, so a file renamed twice in a row would otherwise end up with
 * whichever language finished last instead of the one of its last name.
 */
export function createLanguageLoader(apply: (support: LanguageSupport) => void) {
  let latest = 0;
  return {
    /** Starts loading `language`, or only drops what was loading when there's none. Rejects if loading fails. */
    async load(language: LoadableLanguage | null): Promise<void> {
      const request = ++latest;
      if (language === null) return;
      const support = await language.load();
      if (request === latest) apply(support);
    },
    /** Drops what is loading, for when the editor goes away. */
    cancel(): void {
      latest++;
    },
  };
}
