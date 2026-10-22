function memoryStorage(initial) {
  const items = new Map(initial || []);
  return {
    getItem(key) {
      return items.has(key) ? items.get(key) : null;
    },
    setItem(key, value) {
      items.set(String(key), String(value));
    },
    removeItem(key) {
      items.delete(key);
    }
  };
}

module.exports = { memoryStorage };
