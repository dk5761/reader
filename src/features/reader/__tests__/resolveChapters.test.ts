/**
 * Unit tests for chapter resolution logic in useReaderChapterFlow.
 *
 * These tests cover:
 * - Numeric chapter ordering (1, 2, 3...)
 * - Descending order chapters (10, 9, 8...)
 * - Mixed numeric and non-numeric chapters
 * - Edge case: single chapter
 * - Edge case: first/last chapter boundaries
 *
 * To run these tests, add a test framework (e.g., vitest or jest) to the project
 * and configure it to recognize .test.ts files.
 */

import type { SourceChapter } from "@/services/source";

// Test helper types to match the actual chapter type structure
interface TestChapter extends SourceChapter {
  id: string;
  url?: string;
  title?: string;
  number?: number;
}

/**
 * Resolves the next chapter from a list of chapters based on the current chapter ID.
 * This is extracted from useReaderChapterFlow.ts for testing.
 */
const resolveNextChapter = (
  chapters: TestChapter[],
  currentChapterId: string
): TestChapter | null => {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId);
  if (currentIndex < 0) {
    return null;
  }

  const current = chapters[currentIndex];
  if (current.number !== undefined && Number.isFinite(current.number)) {
    const nextByNumber = chapters
      .filter(
        (chapter) =>
          chapter.id !== current.id &&
          chapter.number !== undefined &&
          Number.isFinite(chapter.number) &&
          chapter.number > current.number!
      )
      .sort((first, second) => (first.number ?? 0) - (second.number ?? 0))[0];

    if (nextByNumber) {
      return nextByNumber;
    }

    // For numeric chapter flows, reaching here means there is no higher chapter.
    // Do not fallback by array index, because many sources return chapters in
    // descending order (latest -> oldest), which would incorrectly move backward.
    return null;
  }

  for (let index = currentIndex + 1; index < chapters.length; index += 1) {
    const candidate = chapters[index];
    if (candidate.id !== current.id) {
      return candidate;
    }
  }

  return null;
};

/**
 * Resolves the previous chapter from a list of chapters based on the current chapter ID.
 * This is extracted from useReaderChapterFlow.ts for testing.
 */
const resolvePreviousChapter = (
  chapters: TestChapter[],
  currentChapterId: string
): TestChapter | null => {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId);
  if (currentIndex < 0) {
    return null;
  }

  const current = chapters[currentIndex];
  if (current.number !== undefined && Number.isFinite(current.number)) {
    const previousByNumber = chapters
      .filter(
        (chapter) =>
          chapter.id !== current.id &&
          chapter.number !== undefined &&
          Number.isFinite(chapter.number) &&
          chapter.number < current.number!
      )
      .sort((first, second) => (second.number ?? 0) - (first.number ?? 0))[0];

    if (previousByNumber) {
      return previousByNumber;
    }

    // For numeric chapter flows, reaching here means there is no lower chapter.
    // Do not fallback by array index, because many sources return chapters in
    // descending order (latest -> oldest), which would incorrectly move forward.
    return null;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = chapters[index];
    if (candidate.id !== current.id) {
      return candidate;
    }
  }

  return null;
};

// ============================================================================
// Test Cases: resolveNextChapter
// ============================================================================

describe("resolveNextChapter", () => {
  describe("numeric chapter ordering (ascending)", () => {
    const chapters: TestChapter[] = [
      { id: "ch1", number: 1 },
      { id: "ch2", number: 2 },
      { id: "ch3", number: 3 },
      { id: "ch4", number: 4 },
      { id: "ch5", number: 5 },
    ];

    test("returns next chapter when on chapter 1", () => {
      expect(resolveNextChapter(chapters, "ch1")?.id).toBe("ch2");
    });

    test("returns next chapter when on chapter 3", () => {
      expect(resolveNextChapter(chapters, "ch3")?.id).toBe("ch4");
    });

    test("returns null when on last chapter", () => {
      expect(resolveNextChapter(chapters, "ch5")).toBeNull();
    });

    test("returns null when current chapter not found", () => {
      expect(resolveNextChapter(chapters, "nonexistent")).toBeNull();
    });
  });

  describe("numeric chapter ordering (descending - common for manga sources)", () => {
    const chapters: TestChapter[] = [
      { id: "ch5", number: 5 },
      { id: "ch4", number: 4 },
      { id: "ch3", number: 3 },
      { id: "ch2", number: 2 },
      { id: "ch1", number: 1 },
    ];

    test("returns next chapter by number, not array position", () => {
      // Even though ch5 is at index 0, next should be null (no higher number)
      expect(resolveNextChapter(chapters, "ch5")).toBeNull();

      // ch4 should still find ch5 as next (higher number)
      expect(resolveNextChapter(chapters, "ch4")?.id).toBe("ch5");

      // ch1 should find ch2 as next
      expect(resolveNextChapter(chapters, "ch1")?.id).toBe("ch2");
    });

    test("correctly handles middle chapters", () => {
      expect(resolveNextChapter(chapters, "ch3")?.id).toBe("ch4");
    });
  });

  describe("non-numeric chapters", () => {
    const chapters: TestChapter[] = [
      { id: "ch1", title: "Introduction" },
      { id: "ch2", title: "The Beginning" },
      { id: "ch3", title: "The Middle" },
    ];

    test("falls back to array order for non-numeric chapters", () => {
      expect(resolveNextChapter(chapters, "ch1")?.id).toBe("ch2");
      expect(resolveNextChapter(chapters, "ch2")?.id).toBe("ch3");
      expect(resolveNextChapter(chapters, "ch3")).toBeNull();
    });
  });

  describe("mixed numeric and non-numeric chapters", () => {
    const chapters: TestChapter[] = [
      { id: "ch10", number: 10 },
      { id: "ch9", number: 9 },
      { id: "ch-1", title: "Pilot" },
      { id: "ch8", number: 8 },
    ];

    test("ignores non-numeric chapters for numeric flow", () => {
      expect(resolveNextChapter(chapters, "ch8")?.id).toBe("ch9");
      expect(resolveNextChapter(chapters, "ch9")?.id).toBe("ch10");
      expect(resolveNextChapter(chapters, "ch10")).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("single chapter returns null", () => {
      const chapters: TestChapter[] = [{ id: "ch1", number: 1 }];
      expect(resolveNextChapter(chapters, "ch1")).toBeNull();
    });

    test("handles chapters with undefined numbers", () => {
      const chapters: TestChapter[] = [
        { id: "ch1", number: 1 },
        { id: "ch2" }, // no number
        { id: "ch3", number: 3 },
      ];
      expect(resolveNextChapter(chapters, "ch1")?.id).toBe("ch3");
    });
  });
});

// ============================================================================
// Test Cases: resolvePreviousChapter
// ============================================================================

describe("resolvePreviousChapter", () => {
  describe("numeric chapter ordering (ascending)", () => {
    const chapters: TestChapter[] = [
      { id: "ch1", number: 1 },
      { id: "ch2", number: 2 },
      { id: "ch3", number: 3 },
      { id: "ch4", number: 4 },
      { id: "ch5", number: 5 },
    ];

    test("returns previous chapter when on chapter 5", () => {
      expect(resolvePreviousChapter(chapters, "ch5")?.id).toBe("ch4");
    });

    test("returns previous chapter when on chapter 3", () => {
      expect(resolvePreviousChapter(chapters, "ch3")?.id).toBe("ch2");
    });

    test("returns null when on first chapter", () => {
      expect(resolvePreviousChapter(chapters, "ch1")).toBeNull();
    });

    test("returns null when current chapter not found", () => {
      expect(resolvePreviousChapter(chapters, "nonexistent")).toBeNull();
    });
  });

  describe("numeric chapter ordering (descending - common for manga sources)", () => {
    const chapters: TestChapter[] = [
      { id: "ch5", number: 5 },
      { id: "ch4", number: 4 },
      { id: "ch3", number: 3 },
      { id: "ch2", number: 2 },
      { id: "ch1", number: 1 },
    ];

    test("returns previous chapter by number, not array position", () => {
      // Even though ch1 is at index 4, previous should be null (no lower number)
      expect(resolvePreviousChapter(chapters, "ch1")).toBeNull();

      // ch5 should find ch4 as previous (lower number)
      expect(resolvePreviousChapter(chapters, "ch5")?.id).toBe("ch4");

      // ch3 should find ch2 as previous
      expect(resolvePreviousChapter(chapters, "ch3")?.id).toBe("ch2");
    });

    test("correctly handles middle chapters", () => {
      expect(resolvePreviousChapter(chapters, "ch4")?.id).toBe("ch3");
    });
  });

  describe("non-numeric chapters", () => {
    const chapters: TestChapter[] = [
      { id: "ch1", title: "Introduction" },
      { id: "ch2", title: "The Beginning" },
      { id: "ch3", title: "The Middle" },
    ];

    test("falls back to array order for non-numeric chapters", () => {
      expect(resolvePreviousChapter(chapters, "ch3")?.id).toBe("ch2");
      expect(resolvePreviousChapter(chapters, "ch2")?.id).toBe("ch1");
      expect(resolvePreviousChapter(chapters, "ch1")).toBeNull();
    });
  });

  describe("mixed numeric and non-numeric chapters", () => {
    const chapters: TestChapter[] = [
      { id: "ch10", number: 10 },
      { id: "ch9", number: 9 },
      { id: "ch-1", title: "Pilot" },
      { id: "ch8", number: 8 },
    ];

    test("ignores non-numeric chapters for numeric flow", () => {
      expect(resolvePreviousChapter(chapters, "ch10")?.id).toBe("ch9");
      expect(resolvePreviousChapter(chapters, "ch9")?.id).toBe("ch8");
      expect(resolvePreviousChapter(chapters, "ch8")).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("single chapter returns null", () => {
      const chapters: TestChapter[] = [{ id: "ch1", number: 1 }];
      expect(resolvePreviousChapter(chapters, "ch1")).toBeNull();
    });

    test("handles chapters with undefined numbers", () => {
      const chapters: TestChapter[] = [
        { id: "ch1", number: 1 },
        { id: "ch2" }, // no number
        { id: "ch3", number: 3 },
      ];
      expect(resolvePreviousChapter(chapters, "ch3")?.id).toBe("ch1");
    });
  });
});

// ============================================================================
// Integration Tests: Chapter Flow
// ============================================================================

describe("chapter flow integration", () => {
  const chapters: TestChapter[] = [
    { id: "vol10", number: 10 },
    { id: "vol9", number: 9 },
    { id: "vol8", number: 8 },
    { id: "vol7", number: 7 },
  ];

  test("can traverse forward and backward through all chapters", () => {
    let currentId = "vol7";

    // Navigate forward
    const forwardPath: string[] = [currentId];
    while (true) {
      const next = resolveNextChapter(chapters, currentId);
      if (!next) break;
      forwardPath.push(next.id);
      currentId = next.id;
    }

    expect(forwardPath).toEqual(["vol7", "vol8", "vol9", "vol10"]);

    // Navigate backward
    const backwardPath: string[] = [currentId];
    while (true) {
      const prev = resolvePreviousChapter(chapters, currentId);
      if (!prev) break;
      backwardPath.push(prev.id);
      currentId = prev.id;
    }

    expect(backwardPath).toEqual(["vol10", "vol9", "vol8", "vol7"]);
  });

  test("navigating forward then backward returns to start", () => {
    let currentId = "vol7";

    // Go forward
    const next1 = resolveNextChapter(chapters, currentId);
    if (next1) currentId = next1.id;
    const next2 = resolveNextChapter(chapters, currentId);
    if (next2) currentId = next2.id;

    expect(currentId).toBe("vol9");

    // Go backward
    const prev1 = resolvePreviousChapter(chapters, currentId);
    if (prev1) currentId = prev1.id;
    const prev2 = resolvePreviousChapter(chapters, currentId);
    if (prev2) currentId = prev2.id;

    expect(currentId).toBe("vol7");
  });
});
