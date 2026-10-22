/**
 * Trả về bản sao đã sort theo variantId tăng dần.
 *
 * Mọi luồng lock tồn kho (`SELECT ... FOR UPDATE` trên inventories) phải duyệt item theo cùng
 * một thứ tự để hai transaction chứa các variant giao nhau không giữ lock chéo nhau (deadlock).
 * Item không có variantId (variant đã bị xóa) được đặt cuối vì không lock gì.
 */
export function sortByVariantId<T extends { variantId: string | null }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.variantId === right.variantId) return 0;
    if (left.variantId === null) return 1;
    if (right.variantId === null) return -1;
    return left.variantId < right.variantId ? -1 : 1;
  });
}
