import type { Equipment, InsertEquipment, System, InsertSystem } from "@shared/schema";

const API_BASE = "/api";

export const api = {
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
      if (!res.ok) throw new Error('Failed to update equipment');
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

    checkout: async (id: string, params: { workOrder: string; techName: string }): Promise<Equipment> => {
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
    swap: async (params: { brokenId: string; replacementId: string; context: 'broken' | 'checked_out'; reason?: string }): Promise<void> => {
      const res = await fetch(`${API_BASE}/equipment/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to swap equipment');
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
};
