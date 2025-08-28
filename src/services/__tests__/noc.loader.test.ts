import { loadNoc, loadNocCategories } from "../../services/noc";

describe("NOC loaders return A4 contract", () => {
  test("loadNoc()", async () => {
    const res = await loadNoc();
    expect(["remote", "cache", "local"]).toContain(res.source);
    expect(res).toHaveProperty("cachedAt");
    expect(res).toHaveProperty("meta");
    expect(res.meta).toHaveProperty("last_checked");
    expect(Array.isArray(res.data)).toBe(true);
  });

  test("loadNocCategories()", async () => {
    const res = await loadNocCategories();
    expect(["remote", "cache", "local"]).toContain(res.source);
    expect(res).toHaveProperty("cachedAt");
    expect(res).toHaveProperty("meta");
    expect(res.meta).toHaveProperty("last_checked");
    expect(Array.isArray(res.data)).toBe(true);
  });
});
