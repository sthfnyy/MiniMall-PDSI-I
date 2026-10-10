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

export function validateStoreData(values = {}) {
  const name = (values.name || "").trim();
  const whatsapp = (values.whatsapp || "").trim();
  const address = (values.address || "").trim();

  if (!name || name.length < 2) {
    throw new Error("Informe o nome da loja (mínimo de 2 caracteres).");
  }

  if (!whatsapp || whatsapp.length < 8) {
    throw new Error("Informe um número de WhatsApp válido.");
  }

  if (!address || address.length < 3) {
    throw new Error("Informe a localização ou endereço da loja.");
  }

  return {
    name,
    description: (values.description || "").trim(),
    whatsapp,
    address,
    category: values.category?.trim() || "",
    hours: (values.hours || "").trim(),
    instagram: (values.instagram || "").trim(),
  };
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

