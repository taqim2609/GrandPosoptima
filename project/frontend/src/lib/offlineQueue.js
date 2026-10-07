export function reconcilePendingOrders(currentOrders, completedIds, errorsById) {
  const completed = new Set(completedIds);

  return currentOrders
    .filter((order) => !completed.has(order.temp_id))
    .map((order) =>
      errorsById.has(order.temp_id)
        ? { ...order, error: errorsById.get(order.temp_id) }
        : order
    );
}
