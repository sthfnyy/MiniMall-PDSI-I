import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  Trash2,
  Plus,
  X,
  Check,
  Percent,
  AlertTriangle,
  Tag,
  Save,
  Store,
  CheckCircle2,
} from "lucide-react";
import { Field, PageTitle } from "../../components/ui";
import { money } from "../../services/catalog";
import {
  getMerchantStore,
  getStoreProducts,
  createStoreProduct,
  updateStoreProduct,
  fetchMerchantProduct,
  fetchMerchantCategories,
  createMerchantProduct,
  updateMerchantProduct,
  uploadMerchantProductPhoto,
  fetchMerchantStore,
} from "../../services/merchant";

const PRESETS = {
  Vestuário: ["P", "M", "G", "GG", "Tamanho Único"],
  Calçados: ["36", "37", "38", "39", "40", "41", "42"],
  Perfumaria: ["30 ml", "50 ml", "100 ml"],
  Acessórios: ["Preto", "Marrom", "Caramelo", "Dourado", "Prata"],
  "Casa e decoração": ["Pequeno", "Médio", "Grande"],
};

export default function ProductForm({
  user,
  data,
  productId,
  go,
  update,
  notify,
  useRealApi = false,
  fetchProductFn = fetchMerchantProduct,
  fetchCategoriesFn = fetchMerchantCategories,
  createProductFn = createMerchantProduct,
  updateProductFn = updateMerchantProduct,
  uploadPhotoFn = uploadMerchantProductPhoto,
  fetchStoreFn = fetchMerchantStore,
}) {
  const isEdit = Boolean(productId);
  const demoStore = getMerchantStore(data, user);
  const [realStore, setRealStore] = useState(null);
  const [categoriesList, setCategoriesList] = useState([]);
  const [realProduct, setRealProduct] = useState(null);

  const [isLoading, setIsLoading] = useState(useRealApi);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const store = useRealApi ? (realStore || demoStore) : demoStore;

  const existingDemoProduct =
    isEdit && store && !useRealApi
      ? data.products.find(
          (p) =>
            Number(p.id) === Number(productId) &&
            Number(p.store) === Number(store.id),
        )
      : null;

  const currentProduct = useRealApi ? realProduct : existingDemoProduct;

  // Form states
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [hasPromotion, setHasPromotion] = useState(false);
  const [sale, setSale] = useState("");
  const [image, setImage] = useState("");
  const [variations, setVariations] = useState([]);
  const [newVariation, setNewVariation] = useState("");
  const [activeStatus, setActiveStatus] = useState(true);

  const fileInputRef = useRef(null);

  // Initial load for real API mode
  useEffect(() => {
    let active = true;

    if (!useRealApi) {
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    setError("");

    const promises = [
      fetchStoreFn().catch(() => null),
      fetchCategoriesFn().catch(() => []),
    ];

    if (isEdit && productId) {
      promises.push(fetchProductFn(productId).catch(() => null));
    }

    Promise.all(promises)
      .then(([storeRes, catsRes, prodRes]) => {
        if (!active) return;
        if (storeRes) setRealStore(storeRes);
        setCategoriesList(catsRes || []);
        if (prodRes) setRealProduct(prodRes);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Erro ao carregar os dados.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [useRealApi, isEdit, productId, fetchStoreFn, fetchCategoriesFn, fetchProductFn]);

  // Sync form inputs when product or categories change
  useEffect(() => {
    if (isEdit) {
      if (currentProduct) {
        setName(currentProduct.name || currentProduct.titulo || "");
        setCategoryId(
          currentProduct.categoryId ||
            currentProduct.categoria_id ||
            categoriesList[0]?.id ||
            data.categories?.[0] ||
            "",
        );
        setDescription(currentProduct.description || currentProduct.descricao || "");
        setPrice(
          currentProduct.price !== undefined
            ? String(currentProduct.price)
            : currentProduct.preco_base !== undefined
              ? String(currentProduct.preco_base)
              : "",
        );
        const promoActive =
          Number(currentProduct.sale) > 0 ||
          (currentProduct.preco_promocional != null &&
            Number(currentProduct.preco_promocional) > 0);
        setHasPromotion(promoActive);
        setSale(
          promoActive
            ? String(currentProduct.sale || currentProduct.preco_promocional)
            : "",
        );
        setImage(
          currentProduct.image || currentProduct.foto_principal_url || "",
        );
        setVariations(
          Array.isArray(currentProduct.variations)
            ? [...currentProduct.variations]
            : [],
        );
        setActiveStatus(
          currentProduct.active !== undefined
            ? Boolean(currentProduct.active)
            : currentProduct.ativo !== undefined
              ? Boolean(currentProduct.ativo)
              : true,
        );
      }
    } else {
      setName("");
      setCategoryId(
        categoriesList[0]?.id ||
          store?.category ||
          data.categories?.[0] ||
          "",
      );
      setDescription("");
      setPrice("");
      setHasPromotion(false);
      setSale("");
      setImage(useRealApi ? "" : "/images/shirt.jpg");
      setVariations([]);
      setActiveStatus(true);
    }
    setError("");
  }, [
    productId,
    isEdit,
    currentProduct,
    store,
    categoriesList,
    data.categories,
    useRealApi,
  ]);

  const categoriesOptions =
    useRealApi && categoriesList.length > 0
      ? categoriesList.map((c) => ({ id: c.id, name: c.name || c.nome }))
      : (data.categories || []).map((cat) => ({ id: cat, name: cat }));

  const currentCategoryObj = categoriesOptions.find(
    (c) => c.id === categoryId || c.name === categoryId,
  );
  const currentCategoryName = currentCategoryObj?.name || categoryId;

  // Handle image upload from computer/phone
  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 5MB.");
      return;
    }

    if (useRealApi) {
      setIsUploading(true);
      setError("");
      try {
        const res = await uploadPhotoFn(file);
        if (res?.url) {
          setImage(res.url);
        }
      } catch (err) {
        setError(err.message || "Falha ao enviar a imagem para o servidor.");
      } finally {
        setIsUploading(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target.result);
        setError("");
      };
      reader.onerror = () => {
        setError("Falha ao ler o arquivo de imagem selecionado.");
      };
      reader.readAsDataURL(file);
    }
  }

  // Variations management
  function handleAddVariation(val) {
    const trimmed = (val || newVariation).trim();
    if (!trimmed) return;

    if (variations.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setNewVariation("");
      return;
    }

    setVariations([...variations, trimmed]);
    setNewVariation("");
  }

  function handleRemoveVariation(indexToRemove) {
    setVariations(variations.filter((_, idx) => idx !== indexToRemove));
  }

  // Calculate promotion stats
  const numPrice = Number(price) || 0;
  const numSale = Number(sale) || 0;
  const discountDiff =
    hasPromotion && numPrice > 0 && numSale > 0 ? numPrice - numSale : 0;
  const discountPercent =
    hasPromotion && numPrice > 0 && numSale > 0 && discountDiff > 0
      ? Math.round((discountDiff / numPrice) * 100)
      : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!name.trim() || name.trim().length < 2) {
      setError("Informe o nome do produto (mínimo de 2 caracteres).");
      return;
    }

    if (isNaN(numPrice) || numPrice <= 0) {
      setError("Informe um preço de venda válido maior que zero.");
      return;
    }

    if (hasPromotion) {
      if (isNaN(numSale) || numSale <= 0) {
        setError("Informe o preço promocional ou desmarque a opção de promoção.");
        return;
      }
      if (numSale >= numPrice) {
        setError("O preço promocional deve ser menor que o preço original.");
        return;
      }
    }

    setIsSaving(true);

    try {
      if (useRealApi) {
        const payload = {
          name: name.trim(),
          description: description.trim(),
          price: numPrice,
          hasPromotion,
          sale: hasPromotion ? numSale : null,
          categoryId: categoryId || categoriesOptions[0]?.id,
          image: image || null,
          variations,
          active: activeStatus,
        };

        let resultProduct;
        if (isEdit) {
          resultProduct = await updateProductFn(productId, payload);
          if (notify) notify(`Produto "${payload.name}" atualizado com sucesso!`);
        } else {
          resultProduct = await createProductFn(payload);
          if (notify) notify(`Produto "${payload.name}" cadastrado com sucesso!`);
        }

        if (update && resultProduct) {
          update((draft) => {
            const index = draft.products.findIndex(
              (p) => String(p.id) === String(resultProduct.id),
            );
            if (index !== -1) {
              draft.products[index] = resultProduct;
            } else {
              draft.products.unshift(resultProduct);
            }
            return draft;
          });
        }
      } else {
        const payload = {
          name: name.trim(),
          description: description.trim(),
          price: numPrice,
          sale: hasPromotion ? numSale : 0,
          category: currentCategoryName,
          variations,
          image: image || "/images/shirt.jpg",
        };

        if (isEdit) {
          update((draft) => {
            updateStoreProduct(draft, user, Number(productId), payload);
            return draft;
          });
          if (notify) notify(`Produto "${payload.name}" atualizado com sucesso!`);
        } else {
          update((draft) => {
            createStoreProduct(draft, user, payload);
            return draft;
          });
          if (notify) notify(`Produto "${payload.name}" cadastrado com sucesso!`);
        }
      }

      go("lojista/produtos");
    } catch (err) {
      setError(err.message || "Erro ao salvar produto.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="consumer-page merchant-page">
        <div className="merchant-loading-state" role="status">
          <p>Carregando dados do produto…</p>
        </div>
      </section>
    );
  }

  if (!store) {
    return (
      <section className="consumer-page merchant-page">
        <div className="merchant-empty-notice">
          <Store size={32} />
          <div>
            <h3>Cadastre sua loja primeiro</h3>
            <p>
              Para cadastrar e editar produtos, sua loja precisa estar configurada.
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
      </section>
    );
  }

  if (isEdit && !currentProduct && !useRealApi) {
    return (
      <section className="consumer-page merchant-page">
        <button
          type="button"
          className="back-link"
          onClick={() => go("lojista/produtos")}
        >
          <ArrowLeft size={16} /> Voltar para Meus Produtos
        </button>
        <div className="panel empty-products-panel section-space">
          <h2>Produto não encontrado</h2>
          <p className="muted">
            O item que você está tentando editar não foi localizado no catálogo da sua loja.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => go("lojista/produtos")}
          >
            Ver produtos da loja
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="consumer-page merchant-page">
      <button
        type="button"
        className="back-link"
        onClick={() => go("lojista/produtos")}
      >
        <ArrowLeft size={16} /> Voltar para Meus Produtos
      </button>

      <PageTitle
        eyebrow="PAINEL DO LOJISTA"
        title={
          isEdit
            ? `Editar Produto: ${currentProduct?.name || currentProduct?.titulo || ""}`
            : "Cadastrar Novo Produto"
        }
        text={
          isEdit
            ? "Atualize as informações, fotos, preços e características do produto."
            : "Preencha os detalhes abaixo para adicionar um novo item à sua loja no MiniMall."
        }
      />

      <div className="consumer-profile-card merchant-form-card">
        <form onSubmit={handleSubmit} className="merchant-form">
          {/* SEÇÃO 1: FOTO DO PRODUTO */}
          <div className="merchant-form-section">
            <h3>Foto do Produto</h3>
            <p className="muted">
              Adicione uma foto de qualidade para destacar seu produto na vitrine dos clientes.
            </p>

            <div className="product-upload-container">
              <div className="product-upload-preview">
                {isUploading ? (
                  <div className="product-upload-placeholder">
                    <span>Enviando foto…</span>
                  </div>
                ) : image ? (
                  <img
                    src={image}
                    alt="Pré-visualização do produto"
                    onError={(e) => {
                      e.target.src = "/images/shirt.jpg";
                    }}
                  />
                ) : (
                  <div className="product-upload-placeholder">
                    <ImageIcon size={44} />
                    <span>Sem imagem selecionada</span>
                  </div>
                )}
              </div>

              <div className="product-upload-controls">
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleImageUpload}
                  disabled={isUploading || isSaving}
                />

                <div className="product-upload-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSaving}
                  >
                    <Upload size={16} />
                    {isUploading
                      ? "Enviando…"
                      : image
                        ? "Trocar foto"
                        : "Fazer upload de foto"}
                  </button>

                  {image && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setImage("")}
                      disabled={isUploading || isSaving}
                    >
                      <Trash2 size={16} />
                      Remover foto
                    </button>
                  )}
                </div>

                <p className="upload-help-text">
                  Suporta formatos JPG, PNG ou WEBP até 5MB. Você também pode colar um link direto de imagem abaixo:
                </p>

                <input
                  type="text"
                  value={
                    image.startsWith("data:")
                      ? "(Imagem enviada via upload)"
                      : image
                  }
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="Ou cole a URL da imagem (ex: /images/shirt.jpg ou https://...)"
                  className="product-url-input"
                  disabled={isUploading || isSaving}
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: INFORMAÇÕES BÁSICAS */}
          <div className="merchant-form-section">
            <h3>Informações do Produto</h3>
            <p className="muted">
              Nome, categoria e descrição principal do produto.
            </p>

            <div className="merchant-grid">
              <Field label="Nome do produto *">
                <input
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Vestido Midi Canelado"
                />
              </Field>

              <Field label="Categoria *">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {categoriesOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Descrição detalhada">
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva detalhes como material, caimento, cuidados e diferenciais..."
              />
            </Field>

            <div className="product-status-toggle">
              <label className="promotion-checkbox-label">
                <input
                  type="checkbox"
                  checked={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.checked)}
                />
                <span>
                  <CheckCircle2 size={16} /> Produto ativo na vitrine (visível aos clientes)
                </span>
              </label>
            </div>
          </div>

          {/* SEÇÃO 3: PREÇO E PROMOÇÃO */}
          <div className="merchant-form-section">
            <h3>Preço e Condições</h3>
            <p className="muted">
              Configure o valor regular de venda e ofereça descontos promocionais atrativos.
            </p>

            <div className="merchant-grid">
              <Field label="Preço de venda regular (R$) *">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                />
              </Field>

              <div className="promotion-toggle-box">
                <label className="promotion-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPromotion}
                    onChange={(e) => {
                      setHasPromotion(e.target.checked);
                      if (!e.target.checked) setSale("");
                    }}
                  />
                  <span>
                    <Tag size={16} /> Ativar preço promocional
                  </span>
                </label>

                {hasPromotion && (
                  <Field label="Preço promocional (R$) *">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required={hasPromotion}
                      value={sale}
                      onChange={(e) => setSale(e.target.value)}
                      placeholder="0,00"
                    />
                  </Field>
                )}
              </div>
            </div>

            {hasPromotion && numPrice > 0 && numSale > 0 && (
              <div
                className={`promotion-feedback ${
                  discountDiff > 0 ? "positive" : "warning"
                }`}
              >
                {discountDiff > 0 ? (
                  <>
                    <Percent size={16} />
                    <span>
                      <strong>Desconto de {discountPercent}%!</strong> O cliente economiza{" "}
                      {money(discountDiff)} comprando na promoção.
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} />
                    <span>
                      O preço promocional precisa ser menor do que o preço regular (
                      {money(numPrice)}).
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* SEÇÃO 4: CARACTERÍSTICAS E VARIAÇÕES */}
          <div className="merchant-form-section">
            <h3>Variações e Características</h3>
            <p className="muted">
              Cadastre tamanhos, cores ou opções disponíveis para o consumidor escolher.
            </p>

            <div className="variations-input-row">
              <input
                type="text"
                value={newVariation}
                onChange={(e) => setNewVariation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddVariation();
                  }
                }}
                placeholder="Ex: P, M, 38, Azul..."
              />
              <button
                type="button"
                className="secondary"
                onClick={() => handleAddVariation()}
              >
                <Plus size={16} /> Adicionar
              </button>
            </div>

            {/* Sugestões rápidas de acordo com a categoria */}
            {PRESETS[currentCategoryName] && (
              <div className="variation-presets">
                <span className="muted">Sugestões rápidas:</span>
                <div className="preset-chips">
                  {PRESETS[currentCategoryName].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="preset-chip-btn"
                      onClick={() => handleAddVariation(preset)}
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de variações ativas */}
            <div className="active-variations-container">
              {variations.length > 0 ? (
                variations.map((v, index) => (
                  <span key={index} className="interactive-variation-tag">
                    {v}
                    <button
                      type="button"
                      onClick={() => handleRemoveVariation(index)}
                      aria-label={`Remover variação ${v}`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))
              ) : (
                <p className="muted empty-variations-notice">
                  Nenhuma variação adicionada ainda. Adicione tamanhos ou cores acima se aplicável.
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* AÇÕES FINAIS */}
          <div className="consumer-form-actions merchant-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => go("lojista/produtos")}
              disabled={isSaving || isUploading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary"
              disabled={isSaving || isUploading}
            >
              <Save size={16} />
              {isSaving
                ? "Salvando…"
                : isEdit
                  ? "Salvar alterações"
                  : "Cadastrar produto"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
