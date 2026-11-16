export function catalogText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

export function matchesCatalogSearch(item, query) {
  const text = [item.name, item.brand, item.category, item.description, item.publicDescription,
    ...(item.variants || []).map((v) => v.shadeName)].join(' ');
  return catalogText(text).includes(catalogText(query).trim());
}

export function sortCatalogItems(items, order, priceOf = (item) => Number(item.unitPrice || 0)) {
  if (order === 'recommended') return items;
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    const difference = order === 'name'
      ? String(a.item.name).localeCompare(String(b.item.name), 'es', { sensitivity: 'base' })
      : (priceOf(a.item) - priceOf(b.item)) * (order === 'price-desc' ? -1 : 1);
    return difference || a.index - b.index;
  }).map(({ item }) => item);
}
