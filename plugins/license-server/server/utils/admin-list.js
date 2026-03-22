"use strict";

const parseQueryInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeSearchTerm = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const matchesSearch = (searchTerm, values = []) => {
  if (!searchTerm) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(searchTerm));
};

const normalizeSortDirection = (value, fallback = "asc") => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "asc" || normalized === "desc") return normalized;
  return fallback;
};

const toComparableValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const maybeDate = Date.parse(value);
    if (!Number.isNaN(maybeDate) && /[-:T]/.test(value)) {
      return maybeDate;
    }

    return value.toLowerCase();
  }

  return String(value).toLowerCase();
};

const compareValues = (left, right) => {
  const a = toComparableValue(left);
  const b = toComparableValue(right);

  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  if (typeof a === "number" && typeof b === "number") {
    return a === b ? 0 : a > b ? 1 : -1;
  }

  return String(a).localeCompare(String(b));
};

const sortItems = (items, accessor, direction = "asc") => {
  const normalizedDirection = normalizeSortDirection(direction, "asc");

  return [...items].sort((left, right) => {
    const result = compareValues(accessor(left), accessor(right));
    return normalizedDirection === "desc" ? result * -1 : result;
  });
};

module.exports = {
  matchesSearch,
  normalizeSearchTerm,
  normalizeSortDirection,
  parseQueryInt,
  sortItems,
};