import React from "react";
import { Heart } from "lucide-react";
import ProductCard from "../../components/ProductCard";

export default function ConsumerFavorites({
  user,
  data,
  products,
  onProduct,
  onStore,
  onToggleFavorite,
  isFavorite = () => true,
  go,
}) {
  const currentUser = data?.users?.find((u) => u.id === user?.id) || user;
  const favoriteIds = currentUser?.favorites || [];

  const list =
    products ||
    (data?.products || []).filter(
      (p) =>
        !p.deleted &&
        favoriteIds.some((id) => Number(id) === Number(p.id)) &&
        (!data?.stores ||
          data.stores.some(
            (s) => s.id === p.store && s.status === "aprovada",
          )),
    );

  return (
    <section className="consumer-page">
      {go && (
        <button className="back-link" onClick={() => go("consumidor")}>
          ← Voltar ao perfil
        </button>
      )}

      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>

        <h1>Meus favoritos</h1>

        <p>
          Consulte os produtos que você adicionou à sua lista de favoritos.
        </p>
      </div>

      <div className="consumer-favorites-header">
        <div>
          <span className="section-index">
            PRODUTOS SALVOS
          </span>

          <h2>
            {list.length}{" "}
            {list.length === 1
              ? "produto favorito"
              : "produtos favoritos"}
          </h2>
        </div>
      </div>

      {list.length > 0 ? (
        <div className="product-grid">
          {list.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              store={data?.stores?.find((s) => s.id === product.store)}
              onProduct={onProduct}
              onStore={onStore}
              isFavorite={isFavorite ? isFavorite(product.id) : true}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Heart size={34} />

          <h3>Nenhum favorito ainda</h3>

          <p>
            Quando você encontrar um produto que gostar,
            poderá adicioná-lo aos seus favoritos.
          </p>

          {go && (
            <button className="primary" onClick={() => go("explorar")}>
              Explorar produtos
            </button>
          )}
        </div>
      )}
    </section>
  );
}
