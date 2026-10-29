import { describe, expect, it } from "vitest";
import { cleanForSpeech, SentenceChunker } from "./text.ts";

describe("SentenceChunker", () => {
  it("emits complete sentences as tokens stream in", () => {
    const c = new SentenceChunker(10);
    expect(c.push("Hola, ¿cómo est")).toEqual([]);
    expect(c.push("ás hoy? Yo estoy muy bien. Gra")).toEqual(["Hola, ¿cómo estás hoy?", "Yo estoy muy bien."]);
    expect(c.push("cias")).toEqual([]);
    expect(c.flush()).toBe("Gracias");
    expect(c.flush()).toBeNull();
  });

  it("merges fragments shorter than the minimum length", () => {
    const c = new SentenceChunker(20);
    expect(c.push("Sí. Claro. Te cuento la receta completa. ")).toEqual(["Sí. Claro. Te cuento la receta completa."]);
  });

  it("does not split decimals", () => {
    const c = new SentenceChunker(5);
    expect(c.push("Cuesta 3.50 euros en total. ")).toEqual(["Cuesta 3.50 euros en total."]);
  });
});

describe("cleanForSpeech", () => {
  it("strips markdown, links, and emoji", () => {
    expect(cleanForSpeech("**Hola** 😀 mira [esto](https://x.y) y `code`\n- punto")).toBe("Hola mira esto y code - punto");
  });
});
