import React from "react";
import { Star, ArrowUpRight } from "lucide-react";
import { rating } from "../services/catalog";
export default function StoreCard({ store: s, data, onStore }) {
  return (
    <button className="store-card" onClick={() => onStore(s.id)}>
      <span className="store-avatar" style={{ background: s.color }}>
        {s.initials}
      </span>
      <span>
        <strong>{s.name}</strong>
        <small>{s.category}</small>
        <span className="rating">
          <Star size={13} />
          {rating(data, s.id)}
        </span>
      </span>
      <ArrowUpRight size={19} />
    </button>
  );
}
