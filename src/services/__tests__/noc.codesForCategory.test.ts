import { codesForCategory } from "../../services/noc";

describe("codesForCategory", () => {
  test("reads 'codes' shape", () => {
    const cats = [{ key: "stem", codes: ["21231"] }, { key: "trades", codes: ["62020"] }];
    expect(codesForCategory("stem", cats)).toEqual(["21231"]);
    expect(codesForCategory("trades", cats)).toEqual(["62020"]);
  });

  test("reads 'noc_codes' shape", () => {
    const cats = [{ key: "stem", noc_codes: ["21231"] }];
    expect(codesForCategory("stem", cats)).toEqual(["21231"]);
  });

  test("reads object map shape", () => {
    const cats = { stem: ["21231"], trades: ["62020"] };
    expect(codesForCategory("stem", cats)).toEqual(["21231"]);
  });

  test("unknown key -> empty", () => {
    const cats = [{ key: "stem", codes: ["21231"] }];
    expect(codesForCategory("other", cats)).toEqual([]);
  });

  test("tolerates strings/object values", () => {
    const catsA = [{ key: "misc", codes: "21231, 62020" }];
    const catsB = { misc: { "21231": true, "62020": true } };
    expect(codesForCategory("misc", catsA)).toEqual(["21231", "62020"]);
    expect(codesForCategory("misc", catsB).sort()).toEqual(["21231", "62020"]);
  });
});
