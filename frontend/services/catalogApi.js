import { apiRequest } from "./api.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRealCatalogId(value) {
  return UUID_PATTERN.test(String(value || ""));
}

export function selectCatalogHighlights(products, useRealCatalog) {
  if (useRealCatalog) return products.slice(0, 4);
  return [2, 4, 3, 5]
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean);
}

function formatAddress(store) {
  const street = [store.endereco_logradouro, store.endereco_numero]
    .filter(Boolean)
    .join(", ");
  return [street, store.endereco_bairro, store.endereco_cidade, store.endereco_uf]
    .filter(Boolean)
    .join(", ");
}

function formatHours(hours) {
  if (!hours) return "Horário não informado";
  if (typeof hours === "string") return hours;
  return Object.entries(hours)
    .map(([day, schedule]) => `${day}: ${schedule}`)
    .join(" · ");
}

export function adaptConsumerCatalog(payload = {}) {
  const categories = (payload.categorias || []).map((category) => ({
    id: category.id,
    name: category.nome,
  }));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return {
    stores: (payload.lojas || []).map((store) => ({
      id: store.id,
      name: store.nome_loja,
      category: "",
      description: store.descricao || "",
      address: formatAddress(store),
      hours: formatHours(store.horario_funcionamento),
      whatsapp: store.whatsapp || "",
      instagram: store.instagram || "",
      facebook: store.facebook || "",
      image: store.logo_url || "",
      logo: store.logo_url || "",
      status: store.status,
    })),
    products: (payload.produtos || []).map((product) => ({
      id: product.id,
      store: product.loja_id,
      categoryId: product.categoria_id,
      category: categoryNames.get(product.categoria_id) || "",
      name: product.titulo,
      description: product.descricao || "",
      price: Number(product.preco_base),
      sale: 0,
      image: product.foto_principal_url || "",
      variations: [],
      active: product.ativo,
    })),
    categories: categories.map((category) => category.name),
  };
}

export async function getConsumerCatalog(request = apiRequest) {
  const payload = await request("/consumidor/catalogo");
  return adaptConsumerCatalog(payload);
}

export async function loadCatalogForMode(useRealApi, request = apiRequest) {
  return useRealApi ? getConsumerCatalog(request) : null;
}
