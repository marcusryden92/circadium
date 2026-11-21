"use client";

import { space, radii } from "@/lib/theme";
import { useMemo } from "react";
import { Caption, CategoryBadge, Combobox, FieldStack } from "@/components/ui";
import { buildIndentedCategoryList } from "@/utils/categoryUtils";
import { useItem } from "../../ItemContext";

export function CategorySection() {
  const { item, category, categories, changeCategory } = useItem();

  const categoryOptions = useMemo(
    () => [
      { value: null, label: <Caption>No category</Caption> },
      ...buildIndentedCategoryList(categories).map((c) => ({
        value: c.id,
        label: (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: space["2"],
              paddingLeft: c.depth * space["3"],
            }}
          >
            {c.color && (
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: radii["pill"],
                  background: c.color,
                  flexShrink: 0,
                }}
              />
            )}
            <span>{c.name}</span>
          </span>
        ),
      })),
    ],
    [categories],
  );

  // Subitems inherit the root's category — show it, but only the top-level
  // item owns the picker.
  if (item.parentId) {
    return (
      <FieldStack label="Category">
        {category ? (
          <CategoryBadge color={category.color ?? "#888"}>
            {category.name}
          </CategoryBadge>
        ) : (
          <Caption>No category</Caption>
        )}
      </FieldStack>
    );
  }

  return (
    <FieldStack label="Category">
      <Combobox
        value={item.categoryId ?? null}
        options={categoryOptions}
        onChange={(v) => changeCategory(v)}
        maxWidth="100%"
        small
        renderValue={() =>
          category ? (
            <CategoryBadge color={category.color ?? "#888"}>
              {category.name}
            </CategoryBadge>
          ) : (
            <Caption>No category</Caption>
          )
        }
        ariaLabel="Category"
      />
    </FieldStack>
  );
}
