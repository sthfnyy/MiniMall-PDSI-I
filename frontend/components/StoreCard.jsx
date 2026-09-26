import React from "react";
import { Star, ArrowUpRight } from "lucide-react";
import { rating } from "../services/catalog";
import StoreIdentity, { storeIdentity } from "./StoreIdentity";
export default function StoreCard({ store: s, data, onStore }) {
  const identity = storeIdentity(s.id);
  return (
    <button
      className={`store-card identity-${identity.name}`}
      style={{ "--store-paper": identity.paper, "--store-ink": identity.ink }}
      onClick={() => onStore(s.id)}
    >
      <span className="store-brand-panel" aria-hidden="true">
        <StoreIdentity store={s} />
        <span className="store-wordmark">{s.name}</span>
      </span>
      <span className="store-card-info">
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
