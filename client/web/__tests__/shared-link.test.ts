import { SHARED_PACKAGE } from "@circadium/shared/meta";

test("web resolves the shared workspace package", () => {
  expect(SHARED_PACKAGE).toBe("@circadium/shared");
});
