import React from "react";
import {
  Store,
  ArrowUpRight,
  Heart,
} from "lucide-react";
import { money, price } from "../services/catalog";

export default function ProductCard({
  product: p,
  store,
  onProduct,
  onStore,
  isFavorite = false,
  onToggleFavorite,
}) {
  return (
    <article className="product-card">
      <div className="product-visual">
        <button
          className="image-link"
          aria-label={`Ver ${p.name}`}
          onClick={() => onProduct(p)}
        >
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
          />
        </button>

        {p.sale > 0 && (
          <span className="sale-tag">
            −
            {Math.round(
              (1 - p.sale / p.price) * 100,
            )}
            %
          </span>
        )}

        {onToggleFavorite && (
          <button
            className={`favorite ${isFavorite ? "is-favorite" : ""}`}
            type="button"
            aria-label={
              isFavorite
                ? `Remover ${p.name} dos favoritos`
                : `Adicionar ${p.name} aos favoritos`
            }
            aria-pressed={isFavorite}
            onClick={() =>
              onToggleFavorite(p)
            }
          >
            <Heart
              size={20}
              fill={
                isFavorite
                  ? "currentColor"
                  : "none"
              }
            />
          </button>
        )}
      </div>

      <div className="product-info">
        <button
          className="store-link"
          onClick={() => onStore(store.id)}
        >
          <Store size={14} />
          {store.name}
        </button>

        <button
          className="product-name"
          onClick={() => onProduct(p)}
        >
          {p.name}
        </button>

        <div className="price">
          <strong>{money(price(p))}</strong>

          {p.sale > 0 && (
            <s>{money(p.price)}</s>
          )}
        </div>

        <button
          className="contact-caption"
          onClick={() => onProduct(p)}
        >
          Ver detalhes
          <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}