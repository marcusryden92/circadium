import type { ZxcvbnResult } from "@zxcvbn-ts/core";

export type PasswordCheck = (
  password: string,
  userInputs: string[],
) => ZxcvbnResult;

let checker: Promise<PasswordCheck> | undefined;

/**
 * zxcvbn's estimate of how guessable a password is (score 0-4), against
 * common passwords, English words and names, keyboard patterns and the
 * user's own details. Its dictionaries are several hundred kB, so they load
 * only when a page that sets a password asks for them, once per page.
 *
 * This is guidance while typing. What the server enforces is the length
 * rule and the breached-password lookup.
 */
export function loadPasswordCheck(): Promise<PasswordCheck> {
  checker ??= Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ])
    .then(([core, common, english]) => {
      const zxcvbn = new core.ZxcvbnFactory({
        translations: english.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...english.dictionary },
        useLevenshteinDistance: true,
      });
      return (password: string, userInputs: string[]) =>
        zxcvbn.check(password, userInputs);
    })
    .catch((error: unknown) => {
      checker = undefined;
      throw error;
    });
  return checker;
}
