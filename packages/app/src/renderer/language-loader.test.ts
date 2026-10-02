import { markdownLanguage } from "@codemirror/lang-markdown";
import { LanguageSupport } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { createLanguageLoader } from "./language-loader.ts";

/** A language whose loading finishes when the test says so. */
function deferredLanguage() {
  const loaded = Promise.withResolvers<LanguageSupport>();
  return { load: () => loaded.promise, finish: loaded.resolve };
}

// Two different supports, told apart by identity.
const typescript = new LanguageSupport(markdownLanguage);
const python = new LanguageSupport(markdownLanguage);

describe("createLanguageLoader", () => {
  it("applies a language once it has loaded", async () => {
    const applied: LanguageSupport[] = [];
    const loader = createLanguageLoader((support) => applied.push(support));
    const language = deferredLanguage();
    const loading = loader.load(language);
    language.finish(typescript);
    await loading;
    expect(applied).toHaveLength(1);
    expect(applied[0]).toBe(typescript);
  });

  it("ends with the language of the last request when an earlier one finishes after it", async () => {
    const applied: LanguageSupport[] = [];
    const loader = createLanguageLoader((support) => applied.push(support));
    const first = deferredLanguage();
    const second = deferredLanguage();
    const loadingFirst = loader.load(first);
    const loadingSecond = loader.load(second);
    second.finish(python);
    await loadingSecond;
    first.finish(typescript);
    await loadingFirst;
    expect(applied).toHaveLength(1);
    expect(applied[0]).toBe(python);
  });

  it("drops a language that finishes after a request for none, such as a rename to an unknown name", async () => {
    const applied: LanguageSupport[] = [];
    const loader = createLanguageLoader((support) => applied.push(support));
    const language = deferredLanguage();
    const loading = loader.load(language);
    await loader.load(null);
    language.finish(typescript);
    await loading;
    expect(applied).toEqual([]);
  });

  it("drops a language that finishes after cancel", async () => {
    const applied: LanguageSupport[] = [];
    const loader = createLanguageLoader((support) => applied.push(support));
    const language = deferredLanguage();
    const loading = loader.load(language);
    loader.cancel();
    language.finish(typescript);
    await loading;
    expect(applied).toEqual([]);
  });
});
