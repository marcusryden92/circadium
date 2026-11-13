import { SHARED_PACKAGE } from "../meta";

test("shared package exposes its name", () => {
  expect(SHARED_PACKAGE).toBe("@circadium/shared");
});
