import type {
  Equipment,
  InsertEquipment,
  System,
  InsertSystem,
  SystemConfig,
  InsertSystemConfig,
  StagedSystem,
  InsertStagedSystem,
  OutageLocationNote,
  InsertOutageLocationNote,
  ActiveOutage,
  InsertActiveOutage,
  Warehouse,
  InsertWarehouse,
  Toolbox,
  InsertToolbox,
  Pouch,
  InsertPouch,
} from "@shared/schema";
import type { BrandingConfig } from "@shared/branding";

const API_BASE = "/api";

export const api = {
  registry: {
    get: async (): Promise<{ warehouses: Warehouse[]; toolboxes: Toolbox[]; pouches: Pouch[] }> => {
      const res = await fetch(`${API_BASE}/registry`);
      if (!res.ok) throw new Error("Failed to fetch platform registry");
      return res.json();
    },
    createWarehouse: async (data: InsertWarehouse): Promise<Warehouse> => {
      const res = await fetch(`${API_BASE}/warehouses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create warehouse");
      return res.json();
    },
    updateWarehouse: async (id: string, data: Partial<InsertWarehouse>): Promise<Warehouse> => {
      const res = await fetch(`${API_BASE}/warehouses/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update warehouse");
      return res.json();
    },
    deleteWarehouse: async (id: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/warehouses/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete warehouse");
    },
    createToolbox: async (data: InsertToolbox): Promise<Toolbox> => {
      const res = await fetch(`${API_BASE}/toolboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create toolbox");
      return res.json();
    },
    updateToolbox: async (id: string, data: Partial<InsertToolbox>): Promise<Toolbox> => {
      const res = await fetch(`${API_BASE}/toolboxes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update toolbox");
      return res.json();
    },
    deleteToolbox: async (id: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/toolboxes/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete toolbox");
    },
    claimUnassignedEquipment: async (toolboxId: string): Promise<number> => {
      const res = await fetch(`${API_BASE}/toolboxes/${encodeURIComponent(toolboxId)}/claim-equipment`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to assign equipment to toolbox");
      const result: { claimedCount: number } = await res.json();
      return result.claimedCount;
    },
    createPouch: async (data: InsertPouch): Promise<Pouch> => {
      const res = await fetch(`${API_BASE}/pouches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create pouch");
      return res.json();
    },
    updatePouch: async (id: string, data: Partial<InsertPouch>): Promise<Pouch> => {
      const res = await fetch(`${API_BASE}/pouches/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update pouch");
      return res.json();
    },
    deletePouch: async (id: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/pouches/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete pouch");
    },
  },
  branding: {
    get: async (): Promise<Partial<BrandingConfig>> => {
      const res = await fetch(`${API_BASE}/branding`);
      if (!res.ok) throw new Error("Failed to fetch branding");
      return res.json();
    },
    save: async (data: BrandingConfig): Promise<void> => {
      const res = await fetch(`${API_BASE}/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        let message = "Failed to save branding";
        try {
          const body = await res.json();
          if (body?.error) {
            message = body.error;
          }
        } catch {
          // Keep the default message when the response is not JSON.
        }
        throw new Error(message);
      }
      await res.json();
    },
  },
  equipment: {
    getAll: async (toolboxId?: string): Promise<Equipment[]> => {
      const query = toolboxId ? `?toolboxId=${encodeURIComponent(toolboxId)}` : "";
      const res = await fetch(`${API_BASE}/equipment${query}`);
      if (!res.ok) throw new Error('Failed to fetch equipment');
      return res.json();
    },

    getOne: async (id: string): Promise<Equipment> => {
      const res = await fetch(`${API_BASE}/equipment/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Failed to fetch equipment');
      return res.json();
    },

    create: async (data: InsertEquipment): Promise<Equipment> => {
      const res = await fetch(`${API_BASE}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create equipment');
      return res.json();
    },

    update: async (id: string, data: Partial<InsertEquipment>): Promise<Equipment> => {
      const res = await fetch(`${API_BASE}/equipment/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        let message = 'Failed to update equipment';
        try {
          const body = await res.json();
          if (body?.error) {
            message = body.error;
          }
        } catch {
          // Ignore JSON parsing errors and keep the default message.
        }
        throw new Error(message);
      }
      return res.json();
    },

    delete: async (id: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/equipment/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete equipment');
    },

    checkoutSystem: async (params: {
      systemColor: string;
      equipmentIds: string[];
      workOrder: string;
      techName: string;
      valveNumber?: string;
    }): Promise<Equipment[]> => {
      const res = await fetch(`${API_BASE}/equipment/checkout/system`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to checkout system');
      return res.json();
    },

    checkinByWorkOrder: async (params: {
      workOrder: string;
      itemReports: Record<string, { isBroken: boolean; notes: string }>;
    }): Promise<Equipment[]> => {
      const res = await fetch(`${API_BASE}/equipment/checkin/workorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to checkin equipment');
      return res.json();
    },

    checkout: async (
      id: string,
      params: { workOrder: string; techName: string; valveNumber?: string }
    ): Promise<Equipment> => {
      const res = await fetch(`${API_BASE}/equipment/${id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to checkout equipment');
      return res.json();
    },

    checkin: async (id: string, params: { notes: string; isBroken: boolean }): Promise<Equipment> => {
      const res = await fetch(`${API_BASE}/equipment/${id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to checkin equipment');
      return res.json();
    },
    getRecentHistory: async (limit = 5): Promise<Array<{ id: string; equipmentId: string; action: string; timestamp: string; details?: string | null; workOrder?: string | null }>> => {
      const res = await fetch(`${API_BASE}/equipment/history/recent?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch equipment history');
      return res.json();
    },
    swap: async (params: { brokenId: string; replacementId: string; context: 'broken' | 'checked_out'; reason?: string }): Promise<void> => {
      const res = await fetch(`${API_BASE}/equipment/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to swap equipment');
      await res.json();
    },
    resolveSwap: async (params: {
      borrowedId: string;
      action: 'return_home' | 'assign_permanent' | 'move_to_spares' | 'set_custom_location';
      destinationLocation?: string;
    }): Promise<void> => {
      const res = await fetch(`${API_BASE}/equipment/swap/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to resolve swap');
      await res.json();
    },
    cleanupStaleCheckoutNotes: async (): Promise<{ updatedCount: number }> => {
      const res = await fetch(`${API_BASE}/equipment/cleanup/stale-checkout-notes`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clean stale checkout notes');
      return res.json();
    },
  },

  systems: {
    getAll: async (): Promise<System[]> => {
      const res = await fetch(`${API_BASE}/systems`);
      if (!res.ok) throw new Error('Failed to fetch systems');
      return res.json();
    },

    create: async (data: InsertSystem): Promise<System> => {
      const res = await fetch(`${API_BASE}/systems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create system');
      return res.json();
    },

    update: async (id: string, data: Partial<InsertSystem>): Promise<System> => {
      const res = await fetch(`${API_BASE}/systems/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update system');
      return res.json();
    },

    delete: async (id: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/systems/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete system');
    },
  },

  systemConfigs: {
    getAll: async (): Promise<SystemConfig[]> => {
      const res = await fetch(`${API_BASE}/system-configs`);
      if (!res.ok) throw new Error('Failed to fetch system configs');
      return res.json();
    },
    save: async (systemColor: string, data: InsertSystemConfig): Promise<SystemConfig> => {
      const res = await fetch(`${API_BASE}/system-configs/${encodeURIComponent(systemColor)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save system config');
      return res.json();
    },
  },

  stagedSystems: {
    getAll: async (): Promise<StagedSystem[]> => {
      const res = await fetch(`${API_BASE}/staged-systems`);
      if (!res.ok) throw new Error('Failed to fetch staged systems');
      return res.json();
    },
    save: async (systemColor: string, data: InsertStagedSystem): Promise<StagedSystem> => {
      const res = await fetch(`${API_BASE}/staged-systems/${encodeURIComponent(systemColor)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        let message = 'Failed to save staged system';
        try {
          const body = await res.json();
          if (body?.error) {
            message = body.error;
          }
        } catch {
          // Keep the default message when the response is not JSON.
        }
        throw new Error(message);
      }
      return res.json();
    },
    clear: async (systemColor: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/staged-systems/${encodeURIComponent(systemColor)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to clear staged system');
    },
    checkout: async (systemColor: string): Promise<void> => {
      const res = await fetch(`${API_BASE}/staged-systems/${encodeURIComponent(systemColor)}/checkout`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clear staged system for checkout');
      await res.json();
    },
  },

  outageBoard: {
    getActive: async (): Promise<ActiveOutage | null> => {
      const res = await fetch(`${API_BASE}/outage-board/active`);
      if (!res.ok) throw new Error('Failed to fetch active outage');
      return res.json();
    },
    saveActive: async (data: InsertActiveOutage): Promise<ActiveOutage> => {
      const res = await fetch(`${API_BASE}/outage-board/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save active outage');
      return res.json();
    },
    clearActive: async (): Promise<void> => {
      const res = await fetch(`${API_BASE}/outage-board/active`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to clear active outage');
    },
    getLocationNotes: async (): Promise<OutageLocationNote[]> => {
      const res = await fetch(`${API_BASE}/outage-board/location-notes`);
      if (!res.ok) throw new Error('Failed to fetch outage board notes');
      return res.json();
    },
    saveLocationNote: async (
      location: string,
      data: InsertOutageLocationNote
    ): Promise<OutageLocationNote> => {
      const res = await fetch(`${API_BASE}/outage-board/location-notes/${encodeURIComponent(location)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save outage board note');
      return res.json();
    },
  },
};
