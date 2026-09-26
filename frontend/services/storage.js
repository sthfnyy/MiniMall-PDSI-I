import { seed } from "./catalog";
const KEY = "minimall-delivery-v1";
export function loadData() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return data ? { ...structuredClone(seed), ...data } : structuredClone(seed);
  } catch {
    return structuredClone(seed);
  }
}
export function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
