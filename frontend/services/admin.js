import { normalize } from "./catalog.js";
export function metrics(data) {
  const users = data.users || [];
  const engaged = new Set(data.reviews.map((r) => r.user)).size;
  return {
    views: data.views || 0,
    stores: data.stores.length,
    products: data.products.filter((p) => !p.deleted).length,
    reviews: data.reviews.length,
    photos: data.reviews.filter((r) => r.photo).length,
    engaged,
    users: users.length,
    engagement: users.length ? Math.round((engaged / users.length) * 100) : 0,
    pending: data.stores.filter((s) => s.status === "pendente").length,
  };
}
export function saveCategory(data, name, previous) {
  const value = name.trim();
  if (!value) throw new Error("Informe o nome da categoria.");
  if (
    data.categories.some(
      (c) => c !== previous && normalize(c) === normalize(value),
    )
  )
    throw new Error("Essa categoria já existe.");
  if (previous) {
    data.categories = data.categories.map((c) => (c === previous ? value : c));
    data.products = data.products.map((p) =>
      p.category === previous ? { ...p, category: value } : p,
    );
  } else data.categories.push(value);
  return data;
}
export function deleteCategory(data, name) {
  if (data.products.some((p) => p.category === name && !p.deleted))
    throw new Error(
      "A categoria possui produtos vinculados e não pode ser excluída.",
    );
  data.categories = data.categories.filter((c) => c !== name);
  return data;
}
export function moderateReview(data, id, part, reason) {
  if (!reason.trim()) throw new Error("Informe o motivo da remoção.");
  const r = data.reviews.find((r) => r.id === id);
  if (!r) return data;
  if (part === "review") data.reviews = data.reviews.filter((x) => x.id !== id);
  if (part === "comment") {
    r.comment = "";
    r.commentRemoved = true;
  }
  if (part === "photo") r.photo = "";
  data.audit.push({
    review: id,
    part,
    reason: reason.trim(),
    date: new Date().toISOString(),
    actor: "administrador",
  });
  return data;
}
