import { describe, it, expect } from "vitest";
import { describeScriptMix, scriptMixHint, SCRIPT_MIX_HINTS } from "./script-mix";

describe("describeScriptMix", () => {
  it("classifies pure Chinese, pure English and code-switching", () => {
    expect(describeScriptMix("我们明天开会")).toBe("zh");
    expect(describeScriptMix("let's ship it tomorrow")).toBe("en");
    expect(describeScriptMix("我们明天要 review 这个 pull request")).toBe("mixed");
  });

  it("ignores a lone Latin letter inside Chinese", () => {
    expect(describeScriptMix("执行 A 计划")).toBe("zh");
    expect(describeScriptMix("3D 打印")).toBe("zh");
  });

  it("returns none for empty or symbol-only input", () => {
    expect(describeScriptMix("")).toBe("none");
    expect(describeScriptMix("123 ... !!")).toBe("none");
  });
});

describe("scriptMixHint", () => {
  it("names both languages for mixed input, in both languages", () => {
    const hint = scriptMixHint("帮我 review 一下");
    expect(hint).toBe(SCRIPT_MIX_HINTS.mixed);
    expect(hint).toContain("Chinese");
    expect(hint).toContain("不要翻译");
  });

  it("is empty when there is nothing to say", () => {
    expect(scriptMixHint("")).toBe("");
  });
});
