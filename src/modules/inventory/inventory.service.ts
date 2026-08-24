import { AUDIT_ACTIONS, ERROR_CODES, STOCK_MOVEMENT_TYPES } from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { auditRepository } from '../audit/audit.repository.js';
import { inventoryRepository } from './inventory.repository.js';
import type {
  AdjustStockDto,
  ListInventoryQueryDto,
  ListStockMovementsQueryDto,
  RestockDto,
} from './inventory.schema.js';

interface RecordedMovement {
  onHandChange: number;
  reservedChange: number;
}

function assertValidStockEventInput(quantity: number, referenceId: string) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || referenceId.trim().length === 0) {
    throw new AppError(409, ERROR_CODES.INVALID_STOCK_OPERATION);
  }
}

function isIdempotentRetry(
  movement: RecordedMovement | null,
  expectedOnHandChange: number,
  expectedReservedChange: number,
) {
  if (!movement) {
    return false;
  }

  if (
    movement.onHandChange !== expectedOnHandChange ||
    movement.reservedChange !== expectedReservedChange
  ) {
    throw new AppError(409, ERROR_CODES.STOCK_EVENT_CONFLICT);
  }

  return true;
}

// ==================== Service ====================

export const inventoryService = {
  async listInventories(query: ListInventoryQueryDto) {
    const result = await inventoryRepository.listInventories(query);

    const items = result.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      onHand: item.onHand,
      reserved: item.reserved,
      available: item.onHand - item.reserved,
      variant: {
        id: item.variant.id,
        sku: item.variant.sku,
        name: item.variant.name,
        price: item.variant.price.toString(),
        isActive: item.variant.isActive,
        product: item.variant.product,
      },
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));

    return {
      items,
      total: result.total,
    };
  },

  async getInventoryByVariantId(variantId: string) {
    const variant = await inventoryRepository.findVariantWithProduct(variantId);

    if (!variant) {
      throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
    }

    const inventory = await inventoryRepository.findByVariantId(variantId);
    if (!inventory) {
      throw new AppError(404, ERROR_CODES.INVENTORY_NOT_FOUND);
    }

    return {
      id: inventory.id,
      variantId: inventory.variantId,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      available: inventory.onHand - inventory.reserved,
      variant: {
        id: inventory.variant.id,
        sku: inventory.variant.sku,
        name: inventory.variant.name,
        price: inventory.variant.price.toString(),
        isActive: inventory.variant.isActive,
        product: inventory.variant.product,
      },
      createdAt: inventory.createdAt.toISOString(),
      updatedAt: inventory.updatedAt.toISOString(),
    };
  },

  async getStockMovements(variantId: string, query: ListStockMovementsQueryDto) {
    const inventory = await inventoryRepository.findByVariantId(variantId);
    if (!inventory) {
      const variant = await inventoryRepository.findVariantWithProduct(variantId);
      if (!variant) {
        throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
      }
      return {
        movements: [],
        total: 0,
      };
    }

    const result = await inventoryRepository.listMovements(inventory.id, query);

    const movements = result.items.map((m) => ({
      id: m.id,
      inventoryId: m.inventoryId,
      type: m.type,
      onHandChange: m.onHandChange,
      reservedChange: m.reservedChange,
      balanceAfterOnHand: m.balanceAfterOnHand,
      balanceAfterReserved: m.balanceAfterReserved,
      reason: m.reason,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      actor: m.actor
        ? {
            id: m.actor.id,
            email: m.actor.email,
            fullName: m.actor.fullName,
            role: m.actor.role,
          }
        : null,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      movements,
      total: result.total,
    };
  },

  async restock(variantId: string, data: RestockDto, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const variant = await inventoryRepository.findVariantWithProduct(variantId, tx);

      if (!variant) {
        throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
      }

      // Ensure inventory record exists
      await inventoryRepository.ensureInventory(variantId, tx);

      // Lock the inventory row
      const inv = await inventoryRepository.findForUpdate(variantId, tx);
      if (!inv) {
        throw new AppError(404, ERROR_CODES.INVENTORY_NOT_FOUND);
      }

      const newOnHand = inv.onHand + data.quantity;

      // Update on-hand stock
      const updated = await inventoryRepository.updateStock(inv.id, { onHand: newOnHand }, tx);

      // Record stock movement ledger
      await inventoryRepository.createStockMovement(
        {
          inventoryId: inv.id,
          type: STOCK_MOVEMENT_TYPES.RESTOCK,
          onHandChange: data.quantity,
          reservedChange: 0,
          balanceAfterOnHand: newOnHand,
          balanceAfterReserved: inv.reserved,
          reason: data.reason,
          referenceType: 'MANUAL',
          referenceId: null,
          actorId,
        },
        tx,
      );

      // Record audit log
      await auditRepository.createAuditLog(
        {
          actorId,
          action: AUDIT_ACTIONS.INVENTORY_RESTOCKED,
          targetType: 'INVENTORY',
          targetId: inv.id,
          payload: {
            variantId,
            quantity: data.quantity,
            reason: data.reason,
            previousOnHand: inv.onHand,
            newOnHand,
            reserved: inv.reserved,
          },
        },
        tx,
      );

      return {
        id: updated.id,
        variantId: updated.variantId,
        onHand: updated.onHand,
        reserved: updated.reserved,
        available: updated.onHand - updated.reserved,
        variant: {
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          price: variant.price.toString(),
          isActive: variant.isActive,
          product: variant.product,
        },
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  },

  async adjustStock(variantId: string, data: AdjustStockDto, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const variant = await inventoryRepository.findVariantWithProduct(variantId, tx);

      if (!variant) {
        throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
      }

      // Ensure inventory record exists
      await inventoryRepository.ensureInventory(variantId, tx);

      // Lock the inventory row
      const inv = await inventoryRepository.findForUpdate(variantId, tx);
      if (!inv) {
        throw new AppError(404, ERROR_CODES.INVENTORY_NOT_FOUND);
      }

      // Invariant: on-hand cannot be adjusted below current reserved stock
      if (data.newOnHand < inv.reserved) {
        throw new AppError(422, ERROR_CODES.INVALID_STOCK_ADJUSTMENT);
      }

      const diffOnHand = data.newOnHand - inv.onHand;

      // Update stock
      const updated = await inventoryRepository.updateStock(
        inv.id,
        { onHand: data.newOnHand },
        tx,
      );

      // Record stock movement ledger
      await inventoryRepository.createStockMovement(
        {
          inventoryId: inv.id,
          type: STOCK_MOVEMENT_TYPES.ADJUSTMENT,
          onHandChange: diffOnHand,
          reservedChange: 0,
          balanceAfterOnHand: data.newOnHand,
          balanceAfterReserved: inv.reserved,
          reason: data.reason,
          referenceType: 'MANUAL',
          referenceId: null,
          actorId,
        },
        tx,
      );

      // Record audit log
      await auditRepository.createAuditLog(
        {
          actorId,
          action: AUDIT_ACTIONS.INVENTORY_ADJUSTED,
          targetType: 'INVENTORY',
          targetId: inv.id,
          payload: {
            variantId,
            previousOnHand: inv.onHand,
            newOnHand: data.newOnHand,
            diffOnHand,
            reason: data.reason,
            reserved: inv.reserved,
          },
        },
        tx,
      );

      return {
        id: updated.id,
        variantId: updated.variantId,
        onHand: updated.onHand,
        reserved: updated.reserved,
        available: updated.onHand - updated.reserved,
        variant: {
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          price: variant.price.toString(),
          isActive: variant.isActive,
          product: variant.product,
        },
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  },

  // ==================== Domain Methods for Cart / Checkout / Order ====================

  async reserveStock(
    variantId: string,
    quantity: number,
    referenceId: string,
    actorId: string | null = null,
    tx: Prisma.TransactionClient,
  ) {
    assertValidStockEventInput(quantity, referenceId);

    const inv = await inventoryRepository.findForUpdate(variantId, tx);
    if (!inv) {
      throw new AppError(404, ERROR_CODES.INVENTORY_NOT_FOUND);
    }

    const existingReservation = await inventoryRepository.findMovementByBusinessEvent(
      inv.id,
      STOCK_MOVEMENT_TYPES.RESERVE,
      'ORDER',
      referenceId,
      tx,
    );
    if (isIdempotentRetry(existingReservation, 0, quantity)) {
      return;
    }

    const available = inv.onHand - inv.reserved;
    if (available < quantity) {
      throw new AppError(409, ERROR_CODES.INSUFFICIENT_STOCK);
    }

    const newReserved = inv.reserved + quantity;
    await inventoryRepository.updateStock(inv.id, { reserved: newReserved }, tx);

    await inventoryRepository.createStockMovement(
      {
        inventoryId: inv.id,
        type: STOCK_MOVEMENT_TYPES.RESERVE,
        onHandChange: 0,
        reservedChange: quantity,
        balanceAfterOnHand: inv.onHand,
        balanceAfterReserved: newReserved,
        reason: `Reserve stock for order ${referenceId}`,
        referenceType: 'ORDER',
        referenceId,
        actorId,
      },
      tx,
    );
  },

  async commitReservation(
    variantId: string,
    quantity: number,
    referenceId: string,
    actorId: string | null = null,
    tx: Prisma.TransactionClient,
  ) {
    assertValidStockEventInput(quantity, referenceId);

    const inv = await inventoryRepository.findForUpdate(variantId, tx);
    if (!inv) {
      throw new AppError(404, ERROR_CODES.INVENTORY_NOT_FOUND);
    }

    const existingCommit = await inventoryRepository.findMovementByBusinessEvent(
      inv.id,
      STOCK_MOVEMENT_TYPES.COMMIT,
      'ORDER',
      referenceId,
      tx,
    );
    if (isIdempotentRetry(existingCommit, -quantity, -quantity)) {
      return;
    }

    const [reservation, release] = await Promise.all([
      inventoryRepository.findMovementByBusinessEvent(
        inv.id,
        STOCK_MOVEMENT_TYPES.RESERVE,
        'ORDER',
        referenceId,
        tx,
      ),
      inventoryRepository.findMovementByBusinessEvent(
        inv.id,
        STOCK_MOVEMENT_TYPES.RELEASE,
        'ORDER',
        referenceId,
        tx,
      ),
    ]);

    if (
      !reservation ||
      reservation.onHandChange !== 0 ||
      reservation.reservedChange !== quantity ||
      release ||
      inv.onHand < quantity ||
      inv.reserved < quantity
    ) {
      throw new AppError(409, ERROR_CODES.INVALID_STOCK_OPERATION);
    }

    const newOnHand = inv.onHand - quantity;
    const newReserved = inv.reserved - quantity;

    await inventoryRepository.updateStock(
      inv.id,
      { onHand: newOnHand, reserved: newReserved },
      tx,
    );

    await inventoryRepository.createStockMovement(
      {
        inventoryId: inv.id,
        type: STOCK_MOVEMENT_TYPES.COMMIT,
        onHandChange: -quantity,
        reservedChange: -quantity,
        balanceAfterOnHand: newOnHand,
        balanceAfterReserved: newReserved,
        reason: `Commit stock for confirmed order ${referenceId}`,
        referenceType: 'ORDER',
        referenceId,
        actorId,
      },
      tx,
    );
  },

  async releaseReservation(
    variantId: string,
    quantity: number,
    referenceId: string,
    actorId: string | null = null,
    tx: Prisma.TransactionClient,
  ) {
    assertValidStockEventInput(quantity, referenceId);

    const inv = await inventoryRepository.findForUpdate(variantId, tx);
    if (!inv) {
      throw new AppError(404, ERROR_CODES.INVENTORY_NOT_FOUND);
    }

    const existingRelease = await inventoryRepository.findMovementByBusinessEvent(
      inv.id,
      STOCK_MOVEMENT_TYPES.RELEASE,
      'ORDER',
      referenceId,
      tx,
    );
    if (isIdempotentRetry(existingRelease, 0, -quantity)) {
      return;
    }

    const [reservation, commit] = await Promise.all([
      inventoryRepository.findMovementByBusinessEvent(
        inv.id,
        STOCK_MOVEMENT_TYPES.RESERVE,
        'ORDER',
        referenceId,
        tx,
      ),
      inventoryRepository.findMovementByBusinessEvent(
        inv.id,
        STOCK_MOVEMENT_TYPES.COMMIT,
        'ORDER',
        referenceId,
        tx,
      ),
    ]);

    if (
      !reservation ||
      reservation.onHandChange !== 0 ||
      reservation.reservedChange !== quantity ||
      commit ||
      inv.reserved < quantity
    ) {
      throw new AppError(409, ERROR_CODES.INVALID_STOCK_OPERATION);
    }

    const newReserved = inv.reserved - quantity;

    await inventoryRepository.updateStock(inv.id, { reserved: newReserved }, tx);

    await inventoryRepository.createStockMovement(
      {
        inventoryId: inv.id,
        type: STOCK_MOVEMENT_TYPES.RELEASE,
        onHandChange: 0,
        reservedChange: -quantity,
        balanceAfterOnHand: inv.onHand,
        balanceAfterReserved: newReserved,
        reason: `Release reserved stock for cancelled order ${referenceId}`,
        referenceType: 'ORDER',
        referenceId,
        actorId,
      },
      tx,
    );
  },
};
