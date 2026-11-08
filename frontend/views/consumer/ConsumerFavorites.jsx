import React, { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import ProductCard from "../../components/ProductCard";
import { money } from "../../services/catalog.js";
import {
  deleteConsumerFavorite,
  listConsumerFavorites,
} from "../../services/favorites.js";

export default function ConsumerFavorites({
  user,
  data,
  products,
  onProduct,
  onStore,
  onToggleFavorite,
  isFavorite = () => true,
  go,
  useRealApi = false,
}) {
  const [realFavorites, setRealFavorites] = useState([]);
  const [loading, setLoading] = useState(useRealApi);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    let active = true;

    if (!useRealApi) {
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");
    listConsumerFavorites()
      .then((favorites) => {
        if (active) setRealFavorites(favorites);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [useRealApi]);

  const currentUser = data?.users?.find((u) => u.id === user?.id) || user;
  const favoriteIds = currentUser?.favorites || [];

  const demoList =
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

  const list = useRealApi ? realFavorites : demoList;

  async function removeRealFavorite(productId) {
    if (removingId) return;
    setRemovingId(productId);
    setError("");

    try {
      await deleteConsumerFavorite(productId);
      setRealFavorites((current) =>
        current.filter((favorite) => favorite.produto.id !== productId),
      );
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setRemovingId(null);
    }
  }

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

      {loading && <p>Carregando seus favoritos...</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && (
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
      )}

      {!loading && list.length > 0 ? (
        <div className="product-grid">
          {useRealApi
            ? list.map(({ produto }) => (
                <article className="product-card" key={produto.id}>
                  <div className="product-visual">
                    {produto.foto_principal_url ? (
                      <img
                        src={produto.foto_principal_url}
                        alt={produto.titulo}
                      />
                    ) : (
                      <div className="empty">
                        <Heart size={28} />
                      </div>
                    )}
                    <button
                      className="favorite is-favorite"
                      type="button"
                      aria-label={`Remover ${produto.titulo} dos favoritos`}
                      disabled={removingId === produto.id}
                      onClick={() => removeRealFavorite(produto.id)}
                    >
                      <Heart size={20} fill="currentColor" />
                    </button>
                  </div>
                  <div className="product-info">
                    <strong className="product-name">{produto.titulo}</strong>
                    <p>{produto.descricao}</p>
                    <div className="price">
                      <strong>{money(Number(produto.preco_base))}</strong>
                    </div>
                    {removingId === produto.id && <small>Removendo...</small>}
                  </div>
                </article>
              ))
            : list.map((product) => (
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
      ) : !loading && !error ? (
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
      ) : null}
    </section>
  );
}
