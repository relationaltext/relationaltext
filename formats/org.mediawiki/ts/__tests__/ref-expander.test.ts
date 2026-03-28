import { describe, it, expect } from "vitest";
import { expandRefs, FacetJSON } from "../ref-expander.js";

/** Helper: get byte length of a UTF-8 string */
function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Helper: get byte offset of a substring's first occurrence */
function byteOffset(haystack: string, needle: string): number {
  const idx = haystack.indexOf(needle);
  if (idx === -1) throw new Error(`"${needle}" not found in "${haystack}"`);
  return byteLen(haystack.slice(0, idx));
}

describe("expandRefs", () => {
  it("1. extracts a simple named ref", () => {
    const input = 'hello<ref name="a">some content</ref> world';
    const result = expandRefs(input, []);

    expect(result.text).toBe("hello¹ world");
    expect(result.references).toHaveLength(1);
    expect(result.references[0]!.rawContent).toBe("some content");
    expect(result.references[0]!.name).toBe("a");
    expect(result.references[0]!.footnoteNumber).toBe(1);
  });

  it("2. self-closing backref reuses footnote number", () => {
    const input =
      'text<ref name="a">first</ref> more<ref name="a" /> end';
    const result = expandRefs(input, []);

    expect(result.text).toBe("text¹ more¹ end");
    // Only one unique reference
    expect(result.references).toHaveLength(1);
    expect(result.references[0]!.rawContent).toBe("first");
  });

  it("3. parses {{Cite web}} template", () => {
    const input =
      '<ref name="cw">{{Cite web |title=Test Article |url=https://example.com |website=Example |date=2024-01-15 |access-date=2024-02-01 |last=Smith |first=John}}</ref>';
    const result = expandRefs(input, []);

    expect(result.references).toHaveLength(1);
    const ref = result.references[0]!;
    expect(ref.title).toBe("Test Article");
    expect(ref.url).toBe("https://example.com");
    expect(ref.website).toBe("Example");
    expect(ref.date).toBe("2024-01-15");
    expect(ref.accessDate).toBe("2024-02-01");
    expect(ref.authors).toBe("John Smith");
  });

  it("4. extracts bare URL from ref content", () => {
    const input =
      '<ref name="x">https://example.com - retrieved 2024</ref>';
    const result = expandRefs(input, []);

    expect(result.references).toHaveLength(1);
    expect(result.references[0]!.url).toBe("https://example.com");
  });

  it("5. note group gets separate numbering", () => {
    const input =
      '<ref name="a">ref one</ref> text <ref group="note">a note</ref> more <ref name="b">ref two</ref>';
    const result = expandRefs(input, []);

    expect(result.text).toBe("¹ text ¹ more ²");
    // 3 references total: a, anonymous note, b
    expect(result.references).toHaveLength(3);
    expect(result.references[0]!.footnoteNumber).toBe(1);
    expect(result.references[0]!.group).toBeNull();
    expect(result.references[1]!.footnoteNumber).toBe(1);
    expect(result.references[1]!.group).toBe("note");
    expect(result.references[2]!.footnoteNumber).toBe(2);
    expect(result.references[2]!.group).toBeNull();
  });

  it("6. adjusts facet byte offsets after ref removal", () => {
    const text = 'AAAA<ref name="x">longcontent</ref>BBBB';
    const afterRef = byteOffset(text, "BBBB");
    const facet: FacetJSON = {
      index: { byteStart: afterRef, byteEnd: afterRef + 4 },
      features: [{ type: "test" }],
    };

    const result = expandRefs(text, [facet]);
    expect(result.text).toContain("BBBB");

    // After replacement the facet should point at "BBBB" in the new string
    const newBBBBStart = byteOffset(result.text, "BBBB");
    expect(result.facets).toHaveLength(1);
    expect(result.facets[0]!.index.byteStart).toBe(newBBBBStart);
    expect(result.facets[0]!.index.byteEnd).toBe(newBBBBStart + 4);
  });

  it("7. removes facets that fall inside a ref span", () => {
    const text = 'AA<ref name="x">{{Cite web |title=T}}</ref>BB';
    // Facet pointing at the template inside the ref
    const templateStart = byteOffset(text, "{{Cite");
    const templateEnd = byteOffset(text, "}}") + byteLen("}}");
    const facet: FacetJSON = {
      index: { byteStart: templateStart, byteEnd: templateEnd },
      features: [{ type: "template" }],
    };

    const result = expandRefs(text, [facet]);
    expect(result.text).toContain("BB");
    // The template facet was inside the ref, so it should be removed
    expect(result.facets).toHaveLength(0);
  });

  it("8. multiple different refs get sequential numbers", () => {
    const input =
      '<ref name="a">one</ref> <ref name="b">two</ref> <ref name="c">three</ref>';
    const result = expandRefs(input, []);

    expect(result.text).toBe("¹ ² ³");
    expect(result.references).toHaveLength(3);
    expect(result.references[0]!.footnoteNumber).toBe(1);
    expect(result.references[1]!.footnoteNumber).toBe(2);
    expect(result.references[2]!.footnoteNumber).toBe(3);
  });

  it("9. text without refs returns unchanged", () => {
    const input = "no refs here at all";
    const facet: FacetJSON = {
      index: { byteStart: 0, byteEnd: 2 },
      features: [{ type: "bold" }],
    };
    const result = expandRefs(input, [facet]);

    expect(result.text).toBe(input);
    expect(result.facets).toEqual([facet]);
    expect(result.references).toHaveLength(0);
  });

  it("10. reflist template facets are preserved", () => {
    const text = '<ref name="a">content</ref>\n{{reflist}}';
    const reflistStart = byteOffset(text, "{{reflist}}");
    const facet: FacetJSON = {
      index: {
        byteStart: reflistStart,
        byteEnd: reflistStart + byteLen("{{reflist}}"),
      },
      features: [{ type: "template", name: "reflist" }],
    };

    const result = expandRefs(text, [facet]);
    // The reflist facet is outside the ref, so it should be preserved (with adjusted offset)
    expect(result.facets).toHaveLength(1);
    expect(result.facets[0]!.features).toEqual([
      { type: "template", name: "reflist" },
    ]);
  });

  it("handles single-quoted attributes", () => {
    const input = "<ref name='foo'>content</ref>";
    const result = expandRefs(input, []);
    expect(result.references[0]!.name).toBe("foo");
  });

  it("handles {{Citation}} template", () => {
    const input =
      '<ref name="c">{{Citation |title=My Title |url=https://test.org}}</ref>';
    const result = expandRefs(input, []);
    expect(result.references[0]!.title).toBe("My Title");
    expect(result.references[0]!.url).toBe("https://test.org");
  });

  it("handles multiline ref content", () => {
    const input = `<ref name="ml">{{Cite web
|title=Multi Line
|url=https://example.com
}}</ref>`;
    const result = expandRefs(input, []);
    expect(result.references[0]!.title).toBe("Multi Line");
    expect(result.references[0]!.url).toBe("https://example.com");
  });

  it("handles UTF-8 multibyte characters correctly", () => {
    // "café" has 5 bytes in UTF-8 (é = 2 bytes)
    const input = 'café<ref name="r">ref</ref> end';
    const result = expandRefs(input, []);
    expect(result.text).toBe("café¹ end");
  });
});
