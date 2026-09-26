import React from "react";

export const storeIdentity = (id) =>
  ({
    1: { name: "flor", paper: "#f0e4d7", ink: "#793d37" },
    2: { name: "passo", paper: "#dfe8ee", ink: "#294b69" },
    3: { name: "essencia", paper: "#ece4ee", ink: "#64436e" },
    4: { name: "casa", paper: "#e8e8d8", ink: "#515a3b" },
  })[id] || { name: "atelier", paper: "#eee2dc", ink: "#745044" };

export default function StoreIdentity({ store, className = "" }) {
  const identity = storeIdentity(store.id);
  return (
    <span
      className={`store-emblem identity-${identity.name} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 80 80" fill="none">
        {store.id === 1 ? (
          <g fill="currentColor">
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <ellipse
                key={angle}
                cx="40"
                cy="25"
                rx="8"
                ry="15"
                transform={`rotate(${angle} 40 40)`}
              />
            ))}
            <circle cx="40" cy="40" r="6" fill={identity.paper} />
          </g>
        ) : store.id === 2 ? (
          <g stroke="currentColor" strokeWidth="8" strokeLinecap="square">
            <path d="M17 50 35 25M34 55l18-25M51 60l12-17" />
          </g>
        ) : store.id === 3 ? (
          <g stroke="currentColor" strokeWidth="1.5">
            {[0, 45, 90, 135].map((angle) => (
              <ellipse
                key={angle}
                cx="40"
                cy="40"
                rx="14"
                ry="29"
                transform={`rotate(${angle} 40 40)`}
              />
            ))}
            <circle cx="40" cy="40" r="4" fill="currentColor" />
          </g>
        ) : (
          <g stroke="currentColor" strokeWidth="3">
            <path d="M17 61V34L40 15l23 19v27H17ZM28 61V40a12 12 0 0 1 24 0v21M40 29v32" />
          </g>
        )}
      </svg>
    </span>
  );
}
