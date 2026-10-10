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
} from "lucide-react";
import { Field, PageTitle } from "../../components/ui";
import { money } from "../../services/catalog";
import {
  getMerchantStore,
  getStoreProducts,
  createStoreProduct,
  updateStoreProduct,
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
}) {
  const store = getMerchantStore(data, user);
  const isEdit = Boolean(productId);

  const existingProduct = isEdit && store
    ? data.products.find(
        (p) => Number(p.id) === Number(productId) && Number(p.store) === Number(store.id),
      )
    : null;

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [hasPromotion, setHasPromotion] = useState(false);
  const [sale, setSale] = useState("");
  const [image, setImage] = useState("");
  const [variations, setVariations] = useState([]);
  const [newVariation, setNewVariation] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef(null);

  // Load existing product or defaults
  useEffect(() => {
    if (isEdit) {
      if (existingProduct) {
        setName(existingProduct.name || "");
        setCategory(existingProduct.category || store?.category || data.categories?.[0] || "");
        setDescription(existingProduct.description || "");
        setPrice(existingProduct.price !== undefined ? String(existingProduct.price) : "");
        const promoActive = Number(existingProduct.sale) > 0;
        setHasPromotion(promoActive);
        setSale(promoActive ? String(existingProduct.sale) : "");
        setImage(existingProduct.image || "");
        setVariations(
          Array.isArray(existingProduct.variations)
            ? [...existingProduct.variations]
            : [],
        );
      }
    } else {
      setName("");
      setCategory(store?.category || data.categories?.[0] || "");
      setDescription("");
      setPrice("");
      setHasPromotion(false);
      setSale("");
      setImage("/images/shirt.jpg");
      setVariations([]);
    }
    setError("");
  }, [productId, isEdit, existingProduct, store, data.categories]);

  // Handle image upload from computer/phone
  function handleImageUpload(e) {
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
  const discountDiff = hasPromotion && numPrice > 0 && numSale > 0 ? numPrice - numSale : 0;
  const discountPercent =
    hasPromotion && numPrice > 0 && numSale > 0 && discountDiff > 0
      ? Math.round((discountDiff / numPrice) * 100)
      : 0;

  function handleSubmit(e) {
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
      const payload = {
        name: name.trim(),
        description: description.trim(),
        price: numPrice,
        sale: hasPromotion ? numSale : 0,
        category: category.trim(),
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

      go("lojista/produtos");
    } catch (err) {
      setError(err.message || "Erro ao salvar produto.");
    } finally {
      setIsSaving(false);
    }
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

  if (isEdit && !existingProduct) {
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
        title={isEdit ? `Editar Produto: ${existingProduct?.name}` : "Cadastrar Novo Produto"}
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
                {image ? (
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
                />

                <div className="product-upload-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={16} />
                    {image ? "Trocar foto" : "Fazer upload de foto"}
                  </button>

                  {image && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setImage("")}
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
                  value={image.startsWith("data:") ? "(Imagem enviada via upload)" : image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="Ou cole a URL da imagem (ex: /images/shirt.jpg ou https://...)"
                  className="product-url-input"
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
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                >
                  {(data.categories || []).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
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
            {PRESETS[category] && (
              <div className="variation-presets">
                <span className="muted">Sugestões rápidas:</span>
                <div className="preset-chips">
                  {PRESETS[category].map((preset) => (
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
              disabled={isSaving}
            >
              Cancelar
            </button>

            <button type="submit" className="primary" disabled={isSaving}>
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

