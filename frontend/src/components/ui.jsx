import React from "react";
import { Search } from "lucide-react";

export const Badge = ({ children, type = "" }) => (
  <span className={"badge " + type}>{children}</span>
);

export function SearchBox({
  value,
  onChange,
  placeholder = "Search products…",
}) {
  return (
    <label className="search">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
