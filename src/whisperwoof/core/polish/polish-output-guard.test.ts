import { describe, it, expect } from "vitest";
import { guardPolishedOutput } from "./polish-output-guard";

// The actual leak observed in production (Qwen3.5 2B), verbatim structure.
const LEAK_RAW =
  "然后郑州好像去欧洲有一些直飞的航班 如果架构合适的话这样对我的出行来说也比较方便一点";
const LEAK_POLISHED =
  "然后郑州好像去欧洲有一些直飞的航班。 如果架构合适， 这样对我的出行来说也比较方便一点。 注： 原文中“架构”为误写， 结合上下文应修正为“签证”或“条件”， 此处按最可能的语义“签证/条件”处理， 但根据严格“不要纠正明显错误”及上下文“出行方便”的语境， 修正为“条件”； 若严格按字面保留错误， 则保持“架构”。 修正后： 然后郑州好像去欧洲有一些直飞的航班。 如果条件合适， 这样对我的出行来说也比较方便一点。";

describe("guardPolishedOutput", () => {
  it("rejects the production leak and returns the raw transcript", () => {
    const r = guardPolishedOutput(LEAK_RAW, LEAK_POLISHED);
    expect(r.accepted).toBe(false);
    expect(r.text).toBe(LEAK_RAW);
  });

  it("accepts a normal cleanup (punctuation, fillers removed)", () => {
    const r = guardPolishedOutput(
      "嗯 帮我把这个 pull request 的 description 写一下 就是重点说明我们改了 pipeline",
      "帮我把这个 pull request 的 description 写一下，重点说明我们改了 pipeline。"
    );
    expect(r.accepted).toBe(true);
  });

  it("accepts mild growth from number/punctuation expansion", () => {
    const r = guardPolishedOutput("明天下午三点开会", "明天下午3:00开会。");
    expect(r.accepted).toBe(true);
  });

  it("rejects ballooned output even without a known marker", () => {
    const raw = "短句";
    const polished = "这里是模型自由发挥写出的一大段与清理无关的长篇内容，" + "废话".repeat(60);
    const r = guardPolishedOutput(raw, polished);
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("growth");
  });

  it("rejects meta markers the user never said", () => {
    const r = guardPolishedOutput(
      "let's ship the fix tomorrow",
      "Here is the cleaned version: Let's ship the fix tomorrow."
    );
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("meta-marker");
  });

  it("does NOT reject a marker the user actually dictated", () => {
    const raw = "会议纪要 注：这条是给下周的 备忘";
    const polished = "会议纪要。注：这条是给下周的备忘。";
    const r = guardPolishedOutput(raw, polished);
    expect(r.accepted).toBe(true);
  });

  it("English 'note:' spoken by the user passes through", () => {
    const r = guardPolishedOutput(
      "note: send the deck to alex before friday",
      "Note: send the deck to Alex before Friday."
    );
    expect(r.accepted).toBe(true);
  });

  it("rejects the production zh->en whole-sentence translation", () => {
    const r = guardPolishedOutput(
      "Pizzo,你知不知道你的手机可不可以用eSIM?",
      "Pizzo, you know your phone can use eSIM?"
    );
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("language-flip");
  });

  it("rejects en->zh whole-sentence translation too", () => {
    const r = guardPolishedOutput(
      "can you check whether the deploy finished on staging",
      "你能检查一下部署是否在预发环境完成了吗？"
    );
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("language-flip");
  });

  describe("partial translation (one clause flipped, the rest kept)", () => {
    it("rejects a Chinese clause rewritten in English", () => {
      const r = guardPolishedOutput(
        "我们明天要 review 这个 pull request 然后再决定要不要 merge",
        "我们明天要 review this pull request and then decide whether to merge."
      );
      expect(r.accepted).toBe(false);
      expect(r.reason).toBe("language-flip");
    });

    it("rejects a short Chinese clause flipped in a mostly-English sentence", () => {
      const r = guardPolishedOutput(
        "这个 bug 我今天修一下 你先 review 别的",
        "这个 bug I'll fix today, 你先 review 别的."
      );
      expect(r.accepted).toBe(false);
      expect(r.reason).toBe("language-flip");
    });

    it("rejects an English clause rewritten in Chinese", () => {
      const r = guardPolishedOutput(
        "帮我看一下 the deploy pipeline is broken 我们得赶紧修",
        "帮我看一下，部署流水线坏了，我们得赶紧修。"
      );
      expect(r.accepted).toBe(false);
      expect(r.reason).toBe("language-flip");
    });

    it("rejects short utterances translated outright", () => {
      expect(guardPolishedOutput("好的谢谢", "Okay, thanks").accepted).toBe(false);
      expect(guardPolishedOutput("拜拜", "Bye bye").accepted).toBe(false);
      expect(guardPolishedOutput("thanks a lot", "非常感谢").accepted).toBe(false);
    });

    it("accepts heavy Chinese filler removal (loses Han, gains no Latin)", () => {
      const r = guardPolishedOutput(
        "嗯 然后 就是 那个 我们 deploy 一下 然后 就是 看看 log",
        "我们 deploy 一下，看看 log。"
      );
      expect(r.accepted).toBe(true);
    });

    it("accepts a self-correction that deletes most of the Chinese", () => {
      const r = guardPolishedOutput(
        "我想要蓝色的 不对 等一下 我是说绿色的 the green one",
        "我想要绿色的，the green one。"
      );
      expect(r.accepted).toBe(true);
    });

    it("accepts English filler and spoken punctuation removal", () => {
      const r = guardPolishedOutput(
        "so like basically 我们 you know need to ship it period new line 然后 review comma okay",
        "我们 need to ship it.\n然后 review, okay."
      );
      expect(r.accepted).toBe(true);
    });

    it("accepts time/date/number conversion that drops Han without adding letters", () => {
      expect(guardPolishedOutput("下午五点半到 三百块", "下午5:30到，300元。").accepted).toBe(true);
      expect(guardPolishedOutput("明天下午三点 pm 开会", "明天下午3 PM 开会。").accepted).toBe(true);
    });

    it("accepts a spoken email assembled into an address", () => {
      const r = guardPolishedOutput(
        "我的邮箱是 john at acme dot com 发到这里",
        "我的邮箱是 john@acme.com，发到这里。"
      );
      expect(r.accepted).toBe(true);
    });

    it("accepts a tiny transliteration fix (欧克 -> OK)", () => {
      expect(guardPolishedOutput("欧克 那我们明天 deploy", "OK，那我们明天 deploy。").accepted).toBe(
        true
      );
    });
  });

  it("accepts genuine zh/en code-switching preserved by the cleanup", () => {
    const r = guardPolishedOutput(
      "帮我把这个 pull request 的 description 写一下 重点说明我们改了 pipeline",
      "帮我把这个 pull request 的 description 写一下，重点说明我们改了 pipeline。"
    );
    expect(r.accepted).toBe(true);
  });

  it("accepts digit conversion without tripping the language ratio", () => {
    const r = guardPolishedOutput("三百块钱 下午五点半到", "300元，下午5:30到。");
    expect(r.accepted).toBe(true);
  });

  it("rejects the production roleplay-emote replies", () => {
    expect(guardPolishedOutput("胖去", "*punch*").accepted).toBe(false);
    expect(guardPolishedOutput("胖去", "*punch*").reason).toBe("emote");
    expect(guardPolishedOutput("屁优滴派", "*Pewds*").accepted).toBe(false);
  });

  it("keeps asterisks the user actually dictated", () => {
    const r = guardPolishedOutput("星号 punch 星号", "*punch*");
    expect(r.accepted).toBe(true);
  });

  it("empty polish passes through for the callers' existing fallback", () => {
    const r = guardPolishedOutput("说了点什么", "");
    expect(r.accepted).toBe(true);
    expect(r.text).toBe("");
  });

  it("long dictations get proportional headroom, short ones do not explode", () => {
    // 100-char raw allows up to 260 chars; a 300-char reply is rejected.
    const raw = "字".repeat(100);
    expect(guardPolishedOutput(raw, "字".repeat(255)).accepted).toBe(true);
    expect(guardPolishedOutput(raw, "字".repeat(300)).accepted).toBe(false);
  });
});
