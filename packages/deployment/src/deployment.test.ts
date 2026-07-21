import { describe, expect, it } from "vitest";
import { assertSlugNonDeceptive, generateConceptSlug } from "./slug.js";
import { robotsTxtAllowsPath } from "@ksp/auditing";

describe("slug policy", () => {
  it("generates conforming random slugs", () => {
    for (let i = 0; i < 20; i++) {
      const slug = generateConceptSlug();
      expect(slug).toMatch(/^concept-[a-z0-9]{8,16}$/);
      expect(() => assertSlugNonDeceptive(slug, "Oakwood Dental Ltd")).not.toThrow();
    }
  });

  it("rejects slugs containing business-name tokens", () => {
    expect(() => assertSlugNonDeceptive("concept-oakwoodx1", "Oakwood Dental Ltd")).toThrow(/token/);
  });

  it("rejects non-conforming and deceptive slugs", () => {
    expect(() => assertSlugNonDeceptive("oakwood-dental-official", "Oakwood Dental Ltd")).toThrow();
    expect(() => assertSlugNonDeceptive("concept-official12", "Some Biz")).toThrow();
  });
});

describe("robots.txt evaluation", () => {
  it("respects a full disallow", () => {
    expect(robotsTxtAllowsPath("User-agent: *\nDisallow: /", "/")).toBe(false);
  });
  it("allows when no rule matches", () => {
    expect(robotsTxtAllowsPath("User-agent: *\nDisallow: /admin", "/")).toBe(true);
  });
  it("honours longest-match allow over disallow", () => {
    const txt = "User-agent: *\nDisallow: /\nAllow: /public";
    expect(robotsTxtAllowsPath(txt, "/public/page")).toBe(true);
    expect(robotsTxtAllowsPath(txt, "/private")).toBe(false);
  });
  it("treats empty disallow as allow-all", () => {
    expect(robotsTxtAllowsPath("User-agent: *\nDisallow:", "/anything")).toBe(true);
  });
});
