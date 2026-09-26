import { normalize, price } from "./catalog.js";
export function searchProducts(data, filters) {
  const {
    query = "",
    category = "",
    store = "",
    min = "",
    max = "",
    sort = "relevancia",
  } = filters;
  if (min !== "" && max !== "" && Number(min) > Number(max))
    throw new Error("O preço mínimo deve ser menor ou igual ao máximo.");
  return data.products
    .filter(
      (p) =>
        !p.deleted &&
        data.stores.some((s) => s.id === p.store && s.status === "aprovada") &&
        (!query ||
          normalize(p.name + " " + p.description).includes(normalize(query))) &&
        (!category || p.category === category) &&
        (!store || p.store === Number(store)) &&
        (min === "" || price(p) >= Number(min)) &&
        (max === "" || price(p) <= Number(max)),
    )
    .sort((a, b) =>
      sort === "menor"
        ? price(a) - price(b)
        : sort === "maior"
          ? price(b) - price(a)
          : a.id - b.id,
    );
}
