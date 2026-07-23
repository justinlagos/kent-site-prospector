import { describe, expect, it } from "vitest";
import { parseColour, deriveBrandProfile } from "./brand.js";

describe("parseColour", () => {
  it("parses rgb, rgba, and hex; rejects transparent", () => {
    expect(parseColour("rgb(181, 70, 30)")).toEqual([181, 70, 30]);
    expect(parseColour("rgba(14, 116, 144, 0.9)")).toEqual([14, 116, 144]);
    expect(parseColour("#0e7490")).toEqual([14, 116, 144]);
    expect(parseColour("#abc")).toEqual([170, 187, 204]);
    expect(parseColour("rgba(0,0,0,0)")).toBeNull();
    expect(parseColour("transparent")).toBeNull();
    expect(parseColour(undefined)).toBeNull();
  });
});

describe("deriveBrandProfile", () => {
  it("derives a hex palette from a real button colour", () => {
    const p = deriveBrandProfile({ buttonBg: "rgb(181, 70, 30)", headerBg: "rgb(42, 30, 23)" });
    expect(p.colours?.primary).toBe("#b5461e");
    // header is dark → used as the dark shade verbatim
    expect(p.colours?.dark).toBe("#2a1e17");
    expect(p.colours?.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.colours?.light).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("skips near-white / near-black / grey backgrounds and finds the real brand colour", () => {
    const p = deriveBrandProfile({
      headerBg: "rgb(255,255,255)",
      buttonBg: "rgb(123,160,91)",
      linkColor: "rgb(90,70,54)",
    });
    expect(p.colours?.primary).toBe("#7ba05b");
  });

  it("omits colours entirely when nothing usable is present (renderer falls back)", () => {
    const p = deriveBrandProfile({ headerBg: "rgb(255,255,255)", buttonBg: "rgb(20,20,20)", bodyBg: "#fff" });
    expect(p.colours).toBeUndefined();
  });

  it("keeps a real named font with safe fallbacks, drops generic-only stacks", () => {
    const p = deriveBrandProfile({ headingFont: '"Fraunces", Georgia, serif', bodyFont: "system-ui, sans-serif" });
    expect(p.headingFont).toContain('"Fraunces"');
    expect(p.headingFont).toContain("sans-serif");
    expect(p.bodyFont).toBeUndefined();
  });

  it("resolves a relative logo src to an absolute URL and ignores data URIs", () => {
    const p = deriveBrandProfile({ logoSrc: "/img/logo.png" }, "https://example.co.uk/home");
    expect(p.logoUrl).toBe("https://example.co.uk/img/logo.png");
    expect(deriveBrandProfile({ logoSrc: "data:image/png;base64,AAAA" }).logoUrl).toBeUndefined();
  });
});
