import type {
  Equipment,
  InsertEquipment,
  System,
  InsertSystem,
  SystemConfig,
  InsertSystemConfig,
  StagedSystem,
  InsertStagedSystem,
} from "@shared/schema";
import type { BrandingConfig } from "@shared/branding";

const API_BASE = "/api";

export const api = {
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
    getAll: async (): Promise<Equipment[]> => {
      const res = await fetch(`${API_BASE}/equipment`);
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
      if (!res.ok) throw new Error('Failed to save staged system');
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
};
