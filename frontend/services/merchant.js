import { apiRequest } from "./api.js";

const PALETTE = [
  "#ede4d7",
  "#dce8ed",
  "#f2e2e9",
  "#e2e8d9",
  "#ede0f6",
  "#fef3c7",
];

export function generateInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ml";
  if (parts.length === 1) return parts[0].slice(0, 2).toLowerCase();
  return (parts[0][0] + parts[1][0]).toLowerCase();
}

export function generateColor(id = 1) {
  const num = typeof id === "number" ? id : id.toString().length;
  return PALETTE[Math.abs(num) % PALETTE.length];
}

export function getMerchantStore(data, user) {
  if (!user || !data?.stores) return null;

  return (
    data.stores.find(
      (s) =>
        s.owner === user.id ||
        s.lojistaId === user.id ||
        (user.id === "merchant" && s.id === 1),
    ) || null
  );
}

export function parseAddress(addressString = "") {
  const raw = (addressString || "").trim();
  if (!raw) {
    return {
      endereco_logradouro: "",
      endereco_cidade: "Picos",
      endereco_uf: "PI",
    };
  }

  const match = raw.match(/[,–—\-]?\s*([^,–—\-/]+)\s*[\-–—/]\s*([a-zA-Z]{2})\s*$/);
  if (match) {
    const cidade = match[1].trim();
    const uf = match[2].trim().toUpperCase();
    const prefix = raw.slice(0, raw.lastIndexOf(match[0])).trim().replace(/[,–—\-]+$/, "").trim();
    return {
      endereco_logradouro: prefix || raw,
      endereco_cidade: cidade || "Picos",
      endereco_uf: uf.length === 2 ? uf : "PI",
    };
  }

  return {
    endereco_logradouro: raw,
    endereco_cidade: "Picos",
    endereco_uf: "PI",
  };
}

export function validateStoreData(values = {}) {
  const name = (values.name || values.nome_loja || "").trim();
  const whatsapp = (values.whatsapp || "").trim();
  const address = (values.address || values.endereco_logradouro || "").trim();

  if (!name || name.length < 2) {
    throw new Error("Informe o nome da loja (mínimo de 2 caracteres).");
  }

  if (!whatsapp || whatsapp.length < 8) {
    throw new Error("Informe um número de WhatsApp válido.");
  }

  if (!address || address.length < 3) {
    throw new Error("Informe a localização ou endereço da loja.");
  }

  let hours = "";
  if (typeof values.hours === "string") {
    hours = values.hours.trim();
  } else if (values.horario_funcionamento && typeof values.horario_funcionamento === "object") {
    hours = (values.horario_funcionamento.texto || values.horario_funcionamento.descricao || "").trim();
  }

  return {
    name,
    description: (values.description || values.descricao || "").trim(),
    whatsapp,
    address,
    category: values.category?.trim() || "",
    hours,
    instagram: (values.instagram || "").trim(),
  };
}

export function normalizeStoreFromApi(apiStore) {
  if (!apiStore) return null;

  let address = apiStore.endereco_logradouro || "";
  if (apiStore.endereco_cidade && apiStore.endereco_uf) {
    const cityState = `${apiStore.endereco_cidade} – ${apiStore.endereco_uf}`;
    if (!address) {
      address = cityState;
    } else if (!address.toLowerCase().includes(apiStore.endereco_cidade.toLowerCase())) {
      address = `${address}, ${cityState}`;
    }
  }

  let hours = "";
  if (typeof apiStore.horario_funcionamento === "string") {
    hours = apiStore.horario_funcionamento;
  } else if (apiStore.horario_funcionamento && typeof apiStore.horario_funcionamento === "object") {
    hours =
      apiStore.horario_funcionamento.texto ||
      apiStore.horario_funcionamento.descricao ||
      "";
  }

  return {
    ...apiStore,
    id: apiStore.id,
    name: apiStore.nome_loja || apiStore.name || "",
    nome_loja: apiStore.nome_loja || apiStore.name || "",
    description: apiStore.descricao ?? apiStore.description ?? "",
    descricao: apiStore.descricao ?? apiStore.description ?? "",
    whatsapp: apiStore.whatsapp || "",
    address,
    hours,
    instagram: apiStore.instagram || "",
    facebook: apiStore.facebook || "",
    status: apiStore.status || "pendente",
    motivo_rejeicao: apiStore.motivo_rejeicao || null,
    initials: generateInitials(apiStore.nome_loja || apiStore.name || ""),
    color: generateColor(apiStore.id || 1),
  };
}

export async function fetchMerchantStore(request = apiRequest) {
  try {
    const data = await request("/lojista/loja");
    return normalizeStoreFromApi(data);
  } catch (err) {
    if (
      err.status === 404 ||
      err.message?.includes("404") ||
      err.message?.includes("não encontrada")
    ) {
      return null;
    }
    throw err;
  }
}

export async function createMerchantStore(values, request = apiRequest) {
  const clean = validateStoreData(values);
  const addressParts = parseAddress(clean.address);

  const payload = {
    nome_loja: clean.name,
    descricao: clean.description || null,
    endereco_logradouro: values.endereco_logradouro || addressParts.endereco_logradouro || null,
    endereco_numero: values.endereco_numero || null,
    endereco_bairro: values.endereco_bairro || null,
    endereco_cidade: values.endereco_cidade || addressParts.endereco_cidade || "Picos",
    endereco_uf: (values.endereco_uf || addressParts.endereco_uf || "PI").toUpperCase(),
    endereco_cep: values.endereco_cep || null,
    horario_funcionamento: clean.hours ? { descricao: clean.hours } : null,
    whatsapp: clean.whatsapp,
    instagram: clean.instagram || null,
    facebook: values.facebook || null,
    logo_url: values.logo_url || null,
  };

  const response = await request("/lojista/loja", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeStoreFromApi(response);
}

export async function updateMerchantStore(values, request = apiRequest) {
  const clean = validateStoreData(values);
  const addressParts = parseAddress(clean.address);

  const payload = {
    nome_loja: clean.name,
    descricao: clean.description || null,
    endereco_logradouro: values.endereco_logradouro || addressParts.endereco_logradouro || null,
    endereco_cidade: values.endereco_cidade || addressParts.endereco_cidade || "Picos",
    endereco_uf: (values.endereco_uf || addressParts.endereco_uf || "PI").toUpperCase(),
    horario_funcionamento: clean.hours ? { descricao: clean.hours } : null,
    whatsapp: clean.whatsapp,
    instagram: clean.instagram || null,
  };

  if (values.endereco_numero !== undefined) payload.endereco_numero = values.endereco_numero || null;
  if (values.endereco_bairro !== undefined) payload.endereco_bairro = values.endereco_bairro || null;
  if (values.endereco_cep !== undefined) payload.endereco_cep = values.endereco_cep || null;
  if (values.facebook !== undefined) payload.facebook = values.facebook || null;
  if (values.logo_url !== undefined) payload.logo_url = values.logo_url || null;

  const response = await request("/lojista/loja", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return normalizeStoreFromApi(response);
}

export async function requestStoreApproval(request = apiRequest) {
  const response = await request("/lojista/loja/solicitar-aprovacao", {
    method: "POST",
  });

  return normalizeStoreFromApi(response);
}

export function saveMerchantStore(data, user, values) {
  if (!user || user.role !== "lojista") {
    throw new Error("Apenas usuários lojistas podem configurar lojas.");
  }

  const clean = validateStoreData(values);
  const existingStore = getMerchantStore(data, user);

  if (existingStore) {
    existingStore.name = clean.name;
    existingStore.description = clean.description;
    existingStore.whatsapp = clean.whatsapp;
    existingStore.address = clean.address;
    if (clean.category) existingStore.category = clean.category;
    existingStore.hours = clean.hours;
    existingStore.instagram = clean.instagram;
    existingStore.initials = generateInitials(clean.name);

    return { data, store: existingStore, isNew: false };
  }

  const nextId =
    data.stores.reduce((max, s) => {
      const idNum = Number(s.id);
      return Number.isFinite(idNum) && idNum > max ? idNum : max;
    }, 0) + 1;

  const newStore = {
    id: nextId,
    owner: user.id,
    name: clean.name,
    description: clean.description,
    whatsapp: clean.whatsapp,
    address: clean.address,
    category: clean.category || (data.categories?.[0] || "Geral"),
    hours: clean.hours,
    instagram: clean.instagram,
    initials: generateInitials(clean.name),
    color: generateColor(nextId),
    status: "pendente",
  };

  data.stores.push(newStore);
  return { data, store: newStore, isNew: true };
}

export function getStoreProducts(data, storeId) {
  if (!data?.products || !storeId) return [];
  return data.products.filter(
    (p) => Number(p.store) === Number(storeId) && !p.deleted,
  );
}

export function deleteStoreProduct(data, user, productId) {
  const store = getMerchantStore(data, user);
  if (!store) {
    throw new Error("Loja do lojista não encontrada.");
  }

  const product = data.products.find(
    (p) =>
      Number(p.id) === Number(productId) &&
      Number(p.store) === Number(store.id),
  );

  if (!product) {
    throw new Error("Produto não encontrado no catálogo da sua loja.");
  }

  product.deleted = true;
  return data;
}

export function updateStoreProduct(data, user, productId, values = {}) {
  const store = getMerchantStore(data, user);
  if (!store) {
    throw new Error("Loja do lojista não encontrada.");
  }

  const product = data.products.find(
    (p) =>
      Number(p.id) === Number(productId) &&
      Number(p.store) === Number(store.id),
  );

  if (!product) {
    throw new Error("Produto não encontrado no catálogo da sua loja.");
  }

  const name = (values.name || "").trim();
  if (!name || name.length < 2) {
    throw new Error("Informe o nome do produto (mínimo de 2 caracteres).");
  }

  const price = Number(values.price);
  if (isNaN(price) || price < 0) {
    throw new Error("Informe um preço válido para o produto.");
  }

  const sale =
    values.sale !== undefined && values.sale !== ""
      ? Number(values.sale)
      : 0;

  if (isNaN(sale) || sale < 0) {
    throw new Error("Informe um preço promocional válido.");
  }

  if (sale > 0 && sale >= price) {
    throw new Error("O preço promocional deve ser menor que o preço original.");
  }

  product.name = name;
  product.description = (values.description || "").trim();
  product.price = price;
  product.sale = sale;
  if (values.category) product.category = values.category.trim();
  if (values.image !== undefined) product.image = values.image.trim();
  if (values.variations !== undefined) {
    product.variations = Array.isArray(values.variations)
      ? values.variations
      : typeof values.variations === "string"
        ? values.variations
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
  }

  return { data, product };
}

export function createStoreProduct(data, user, values = {}) {
  const store = getMerchantStore(data, user);
  if (!store) {
    throw new Error("Você precisa cadastrar sua loja antes de adicionar produtos.");
  }

  const name = (values.name || "").trim();
  if (!name || name.length < 2) {
    throw new Error("Informe o nome do produto (mínimo de 2 caracteres).");
  }

  const price = Number(values.price);
  if (isNaN(price) || price < 0) {
    throw new Error("Informe um preço válido para o produto.");
  }

  const sale =
    values.sale !== undefined && values.sale !== ""
      ? Number(values.sale)
      : 0;

  if (isNaN(sale) || sale < 0) {
    throw new Error("Informe um preço promocional válido.");
  }

  if (sale > 0 && sale >= price) {
    throw new Error("O preço promocional deve ser menor que o preço original.");
  }

  const nextId =
    data.products.reduce((max, p) => {
      const idNum = Number(p.id);
      return Number.isFinite(idNum) && idNum > max ? idNum : max;
    }, 0) + 1;

  const newProduct = {
    id: nextId,
    store: store.id,
    name,
    description: (values.description || "").trim(),
    price,
    sale,
    category:
      values.category?.trim() ||
      store.category ||
      data.categories?.[0] ||
      "Geral",
    image: values.image?.trim() || "/images/shirt.jpg",
    variations: Array.isArray(values.variations)
      ? values.variations
      : typeof values.variations === "string"
        ? values.variations
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
  };

  data.products.push(newProduct);
  return { data, product: newProduct };
}
