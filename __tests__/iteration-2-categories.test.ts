import {
  validateCategoryInput,
  canDeleteCategory,
  toggleCategoryStatus,
  filterCategories,
  FilterableCategory,
} from "../lib/category-logic";

describe("Iterasi 2: Category Management & Guard Invariants", () => {
  describe("Category Input Validation (validateCategoryInput)", () => {
    it("accepts valid category name", () => {
      expect(validateCategoryInput("Makanan")).toEqual({ isValid: true });
      expect(validateCategoryInput("Minuman Dingin")).toEqual({
        isValid: true,
      });
    });

    it("rejects empty or whitespace-only category name", () => {
      const emptyResult = validateCategoryInput("");
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe("Nama kategori wajib diisi");

      const spaceResult = validateCategoryInput("   ");
      expect(spaceResult.isValid).toBe(false);
      expect(spaceResult.error).toBe("Nama kategori wajib diisi");
    });
  });

  describe("Category Delete Guard (canDeleteCategory - PRD Section 9)", () => {
    it("strictly prohibits deletion if linked products > 0", () => {
      const result = canDeleteCategory(5);
      expect(result.canDelete).toBe(false);
      expect(result.reason).toContain(
        "Kategori masih memiliki 5 produk yang terhubung",
      );
    });

    it("prohibits deletion even if exactly 1 product is linked", () => {
      const result = canDeleteCategory(1);
      expect(result.canDelete).toBe(false);
      expect(result.reason).toContain("1 produk");
    });

    it("permits deletion when zero products are linked", () => {
      const result = canDeleteCategory(0);
      expect(result.canDelete).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("handles negative or invalid number gracefully", () => {
      // @ts-expect-error test invalid string coercion
      expect(canDeleteCategory("0").canDelete).toBe(true);
      // @ts-expect-error test undefined coercion
      expect(canDeleteCategory(undefined).canDelete).toBe(true);
    });
  });

  describe("Category Status Toggle (toggleCategoryStatus)", () => {
    it("switches Aktif to Nonaktif", () => {
      expect(toggleCategoryStatus("Aktif")).toBe("Nonaktif");
    });

    it("switches Nonaktif to Aktif", () => {
      expect(toggleCategoryStatus("Nonaktif")).toBe("Aktif");
    });
  });

  describe("Category Filtering & Search (filterCategories)", () => {
    const mockCategories: FilterableCategory[] = [
      {
        id: "1",
        name: "Makanan Berat",
        description: "Nasi goreng dan mie",
        status: "Aktif",
      },
      {
        id: "2",
        name: "Minuman Kopi",
        description: "Espresso dan latte",
        status: "Aktif",
      },
      {
        id: "3",
        name: "Minuman Segar",
        description: "Jus dan es teh",
        status: "Nonaktif",
      },
      { id: "4", name: "Snack & Cemilan", description: null, status: "Aktif" },
    ];

    it("returns all categories when query is empty and status is Semua", () => {
      const result = filterCategories(mockCategories, "", "Semua");
      expect(result).toHaveLength(4);
    });

    it("filters categories by status correctly", () => {
      const aktif = filterCategories(mockCategories, "", "Aktif");
      expect(aktif).toHaveLength(3);
      expect(aktif.every((c) => c.status === "Aktif")).toBe(true);

      const nonaktif = filterCategories(mockCategories, "", "Nonaktif");
      expect(nonaktif).toHaveLength(1);
      expect(nonaktif[0].name).toBe("Minuman Segar");
    });

    it("searches by name case-insensitively", () => {
      const result = filterCategories(mockCategories, "kopi");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Minuman Kopi");
    });

    it("searches by description when name does not match", () => {
      const result = filterCategories(mockCategories, "goreng");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Makanan Berat");
    });

    it("safely handles categories with null descriptions during search", () => {
      const result = filterCategories(mockCategories, "cemilan");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Snack & Cemilan");
    });

    it("combines search query with status filter", () => {
      const result = filterCategories(mockCategories, "minuman", "Aktif");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Minuman Kopi");

      const nonaktifResult = filterCategories(
        mockCategories,
        "minuman",
        "Nonaktif",
      );
      expect(nonaktifResult).toHaveLength(1);
      expect(nonaktifResult[0].name).toBe("Minuman Segar");
    });
  });
});
