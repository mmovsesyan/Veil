/**
 * Verification test: ensures @fast-check/vitest integration works correctly.
 * This file validates that property-based testing infrastructure is properly configured.
 */
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import fc from "fast-check";

describe("fast-check integration", () => {
  test.prop([fc.string()])("string identity property", (s) => {
    // Property: any string parsed and stringified remains the same
    expect(JSON.parse(JSON.stringify(s))).toBe(s);
  });

  test.prop([fc.integer(), fc.integer()])(
    "addition is commutative",
    (a, b) => {
      expect(a + b).toBe(b + a);
    }
  );

  test.prop([fc.array(fc.integer())])(
    "array sort is idempotent",
    (arr) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const sortedTwice = [...sorted].sort((a, b) => a - b);
      expect(sorted).toEqual(sortedTwice);
    }
  );
});
