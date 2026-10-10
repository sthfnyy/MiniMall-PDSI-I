import React, { useState } from "react";
import {
  Package,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Tag,
  AlertTriangle,
  ExternalLink,
  Store,
  Check,
  Percent,
} from "lucide-react";
import { Field, PageTitle, Modal, Empty } from "../../components/ui";
import { money, price } from "../../services/catalog";
import {
  getMerchantStore,
  getStoreProducts,
  deleteStoreProduct,
  updateStoreProduct,
  createStoreProduct,
} from "../../services/merchant";
import MerchantNav from "./MerchantNav";

export default function ProductList({
  user,
  data,
  update,
  go,
  notify,
}) {
  const store = getMerchantStore(data, user);
  const products = store ? getStoreProducts(data, store.id) : [];

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  // Modal states
  const [viewProduct, setViewProduct] = useState(null);
  const [deleteProduct, setDeleteProduct] = useState(null);

  function handleOpenEdit(p) {
    go(`lojista/produtos/editar/${p.id}`);
  }

  function handleOpenCreate() {
    go("lojista/produtos/novo");
  }

  function handleConfirmDelete() {
    if (!deleteProduct) return;
    try {
      update((draft) => {
        deleteStoreProduct(draft, user, deleteProduct.id);
        return draft;
      });
      if (notify) notify(`Produto "${deleteProduct.name}" excluído.`);
      setDeleteProduct(null);
    } catch (err) {
      if (notify) notify(err.message || "Não foi possível excluir o produto.");
    }
  }

  // Filter products by search and category
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      (p.description &&
        p.description.toLowerCase().includes(search.trim().toLowerCase()));

    const matchesCategory =
      !selectedCategory || p.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <section className="consumer-page merchant-page">
      <PageTitle
        eyebrow="PAINEL DO LOJISTA"
        title="Catálogo de Produtos"
        text="Acompanhe, consulte, edite e remova os itens da sua loja cadastrada no MiniMall."
      />

      <MerchantNav current="produtos" go={go} />

      {!store ? (
        <div className="merchant-empty-notice">
          <Store size={32} />
          <div>
            <h3>Cadastre sua loja primeiro</h3>
            <p>
              Para gerenciar produtos, é necessário que sua loja esteja
              configurada no sistema.
            </p>
            <button
              type="button"
              className="primary section-space"
              onClick={() => go("lojista")}
            >
              Configurar Loja
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* TOOLBAR */}
          <div className="merchant-products-toolbar">
            <div className="merchant-toolbar-filters">
              <div className="merchant-search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Pesquisar no catálogo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Pesquisar produtos"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="merchant-category-select"
                aria-label="Filtrar por categoria"
              >
                <option value="">Todas as categorias</option>
                {(data.categories || []).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="merchant-toolbar-actions">
              <span className="merchant-count-badge">
                {products.length} {products.length === 1 ? "produto" : "produtos"}
              </span>

              <button
                type="button"
                className="primary"
                onClick={handleOpenCreate}
              >
                <Plus size={16} />
                Cadastrar produto
              </button>
            </div>
          </div>

          {/* LISTAGEM DE PRODUTOS */}
          {filteredProducts.length === 0 ? (
            <div className="panel empty-products-panel">
              {products.length === 0 ? (
                <Empty
                  title="Nenhum produto cadastrado"
                  text="Sua loja ainda não possui produtos. Cadastre o primeiro item para que os consumidores possam visualizá-lo."
                  action={
                    <button
                      className="primary"
                      type="button"
                      onClick={handleOpenCreate}
                    >
                      <Plus size={16} />
                      Cadastrar primeiro produto
                    </button>
                  }
                />
              ) : (
                <Empty
                  title="Nenhum produto encontrado"
                  text="Nenhum item corresponde aos filtros selecionados. Tente outro termo de pesquisa."
                  action={
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setSelectedCategory("");
                      }}
                    >
                      Limpar filtros
                    </button>
                  }
                />
              )}
            </div>
          ) : (
            <div className="merchant-products-grid">
              {filteredProducts.map((p) => {
                const hasSale = Number(p.sale) > 0;
                return (
                  <article key={p.id} className="merchant-product-card">
                    <div className="merchant-card-media">
                      <img
                        src={p.image || "/images/shirt.jpg"}
                        alt={p.name}
                        onError={(e) => {
                          e.target.src = "/images/shirt.jpg";
                        }}
                      />
                      {hasSale && (
                        <span className="product-sale-tag">
                          <Percent size={12} /> Promoção
                        </span>
                      )}
                    </div>

                    <div className="merchant-card-info">
                      <span className="merchant-card-category">{p.category}</span>
                      <h3 className="merchant-card-title">{p.name}</h3>

                      <div className="merchant-card-pricing">
                        {hasSale ? (
                          <>
                            <strong className="merchant-price sale">
                              {money(p.sale)}
                            </strong>
                            <span className="merchant-price original">
                              {money(p.price)}
                            </span>
                          </>
                        ) : (
                          <strong className="merchant-price">
                            {money(p.price)}
                          </strong>
                        )}
                      </div>

                      {p.variations && p.variations.length > 0 && (
                        <div className="merchant-card-variations">
                          {p.variations.slice(0, 4).map((v) => (
                            <span key={v} className="variation-pill">
                              {v}
                            </span>
                          ))}
                          {p.variations.length > 4 && (
                            <span className="variation-pill more">
                              +{p.variations.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="merchant-card-actions">
                      <button
                        type="button"
                        className="icon-action-btn view-btn"
                        title="Consultar detalhes"
                        aria-label={`Consultar ${p.name}`}
                        onClick={() => setViewProduct(p)}
                      >
                        <Eye size={17} />
                        <span>Consultar</span>
                      </button>

                      <button
                        type="button"
                        className="icon-action-btn edit-btn"
                        title="Editar produto"
                        aria-label={`Editar ${p.name}`}
                        onClick={() => handleOpenEdit(p)}
                      >
                        <Pencil size={17} />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        className="icon-action-btn delete-btn"
                        title="Excluir produto"
                        aria-label={`Excluir ${p.name}`}
                        onClick={() => setDeleteProduct(p)}
                      >
                        <Trash2 size={17} />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* MODAL DE CONSULTA DO PRODUTO */}
      {viewProduct && (
        <Modal
          title="Detalhes do Produto"
          onClose={() => setViewProduct(null)}
          wide
        >
          <div className="merchant-modal-detail">
            <div className="merchant-detail-image-wrap">
              <img
                src={viewProduct.image || "/images/shirt.jpg"}
                alt={viewProduct.name}
                onError={(e) => {
                  e.target.src = "/images/shirt.jpg";
                }}
              />
            </div>

            <div className="merchant-detail-content">
              <span className="eyebrow muted">{viewProduct.category}</span>
              <h2>{viewProduct.name}</h2>

              <div className="merchant-detail-prices">
                {Number(viewProduct.sale) > 0 ? (
                  <>
                    <span className="detail-price-sale">
                      {money(viewProduct.sale)}
                    </span>
                    <span className="detail-price-orig">
                      De {money(viewProduct.price)}
                    </span>
                    <span className="status-badge approved">
                      Em promoção
                    </span>
                  </>
                ) : (
                  <span className="detail-price-regular">
                    {money(viewProduct.price)}
                  </span>
                )}
              </div>

              <div className="merchant-detail-section">
                <h4>Descrição</h4>
                <p>
                  {viewProduct.description ||
                    "Nenhuma descrição informada para este produto."}
                </p>
              </div>

              {viewProduct.variations && viewProduct.variations.length > 0 && (
                <div className="merchant-detail-section">
                  <h4>Variações e Opções</h4>
                  <div className="merchant-variations-list">
                    {viewProduct.variations.map((v) => (
                      <span key={v} className="variation-pill active">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="merchant-detail-footer-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const target = viewProduct;
                    setViewProduct(null);
                    go(`produto/${target.id}`);
                  }}
                >
                  <ExternalLink size={16} />
                  Ver na vitrine pública
                </button>

                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const target = viewProduct;
                    setViewProduct(null);
                    handleOpenEdit(target);
                  }}
                >
                  <Pencil size={16} />
                  Editar produto
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deleteProduct && (
        <Modal
          title="Excluir Produto"
          onClose={() => setDeleteProduct(null)}
        >
          <div className="merchant-delete-confirm">
            <div className="delete-warning-icon">
              <AlertTriangle size={36} />
            </div>

            <p>
              Tem certeza que deseja remover o produto{" "}
              <strong>"{deleteProduct.name}"</strong> do catálogo da sua loja?
            </p>
            <p className="muted">
              Esta ação removerá o produto imediatamente da sua vitrine para os
              clientes.
            </p>

            <div className="consumer-form-actions section-space">
              <button
                type="button"
                className="secondary"
                onClick={() => setDeleteProduct(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary delete-confirm-btn"
                onClick={handleConfirmDelete}
              >
                <Trash2 size={16} />
                Sim, excluir produto
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

