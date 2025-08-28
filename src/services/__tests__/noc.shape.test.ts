import noc from "../../data/noc.2021.json";
import cats from "../../data/noc.categories.json";

function isNocItem(x: any): x is { code: string; title?: string } {
  return !!x && typeof x.code === "string";
}
function isCategory(x: any): x is { key: string; title?: string; codes?: string[] } {
  return !!x && typeof x.key === "string";
}

describe("NOC & Categories JSON shape", () => {
  test("noc.2021.json has minimal required shape", () => {
    expect(noc.schema_version).toBe("1");
    expect(typeof noc.last_checked).toBe("string");
    expect(Array.isArray(noc.items)).toBe(true);
    expect(noc.items.every(isNocItem)).toBe(true);
  });

  test("noc.categories.json has minimal required shape", () => {
    expect(cats.schema_version).toBe("1");
    expect(typeof cats.last_checked).toBe("string");
    expect(Array.isArray(cats.categories)).toBe(true);
    expect(cats.categories.every(isCategory)).toBe(true);
  });
});
