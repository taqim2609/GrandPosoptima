import { reconcilePendingOrders } from "./offlineQueue";

describe("reconcilePendingOrders", () => {
  it("removes completed orders while preserving orders added during sync", () => {
    const olderOrder = { temp_id: "old" };
    const newlyQueuedOrder = { temp_id: "new" };

    expect(
      reconcilePendingOrders([olderOrder, newlyQueuedOrder], ["old"], new Map())
    ).toEqual([newlyQueuedOrder]);
  });

  it("keeps failed orders and updates their error without restoring removed orders", () => {
    const failedOrder = { temp_id: "failed", error: null };

    expect(
      reconcilePendingOrders(
        [failedOrder],
        ["completed"],
        new Map([["failed", "Tidak ada koneksi"]])
      )
    ).toEqual([{ temp_id: "failed", error: "Tidak ada koneksi" }]);
  });
});
