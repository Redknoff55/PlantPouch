import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';

export type EquipmentStatus = 'available' | 'checked_out' | 'broken';

export interface Equipment {
  id: string; // The "QR Code"
  name: string;
  category: string;
  status: EquipmentStatus;
  workOrder?: string;
  checkedOutBy?: string;
  checkedOutAt?: string;
  notes?: string;
  history: {
    action: 'check_out' | 'check_in' | 'report_broken' | 'maintenance';
    timestamp: string;
    details?: string;
    workOrder?: string;
  }[];
}

interface EquipmentStore {
  equipment: Equipment[];
  checkOut: (id: string, workOrder: string, techName: string) => void;
  checkIn: (id: string, notes: string, isBroken: boolean) => void;
  getEquipment: (id: string) => Equipment | undefined;
  reset: () => void;
}

const INITIAL_DATA: Equipment[] = [
  {
    id: 'EQ-001',
    name: 'Fluke 87V Multimeter',
    category: 'Measurement',
    status: 'available',
    history: [],
    notes: 'Calibrated last month'
  },
  {
    id: 'EQ-002',
    name: 'Tektronix Oscilloscope',
    category: 'Analysis',
    status: 'available',
    history: [],
  },
  {
    id: 'EQ-003',
    name: 'Hydraulic Pressure Gauge',
    category: 'Pressure',
    status: 'broken',
    notes: 'Leaking seal on connector',
    history: [
      {
        action: 'report_broken',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        details: 'Leaking seal on connector'
      }
    ]
  },
  {
    id: 'EQ-004',
    name: 'Thermal Camera T540',
    category: 'Imaging',
    status: 'checked_out',
    workOrder: 'WO-2024-889',
    checkedOutBy: 'Tech #42',
    checkedOutAt: new Date(Date.now() - 3600000).toISOString(),
    history: [
      {
        action: 'check_out',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        workOrder: 'WO-2024-889',
        details: 'Routine inspection'
      }
    ]
  },
  {
    id: 'EQ-005',
    name: 'Vibration Analyzer',
    category: 'Analysis',
    status: 'available',
    history: [],
  }
];

export const useEquipmentStore = create<EquipmentStore>()(
  persist(
    (set, get) => ({
      equipment: INITIAL_DATA,
      
      checkOut: (id, workOrder, techName) => {
        set((state) => ({
          equipment: state.equipment.map((eq) => {
            if (eq.id !== id) return eq;
            
            return {
              ...eq,
              status: 'checked_out',
              workOrder,
              checkedOutBy: techName,
              checkedOutAt: new Date().toISOString(),
              history: [
                {
                  action: 'check_out',
                  timestamp: new Date().toISOString(),
                  workOrder,
                  details: `Checked out by ${techName}`
                },
                ...eq.history
              ]
            };
          })
        }));
      },

      checkIn: (id, notes, isBroken) => {
        set((state) => ({
          equipment: state.equipment.map((eq) => {
            if (eq.id !== id) return eq;

            const newStatus = isBroken ? 'broken' : 'available';
            const action = isBroken ? 'report_broken' : 'check_in';
            
            return {
              ...eq,
              status: newStatus,
              workOrder: undefined,
              checkedOutBy: undefined,
              checkedOutAt: undefined,
              notes: notes || eq.notes, // Keep old notes if no new ones, or update
              history: [
                {
                  action,
                  timestamp: new Date().toISOString(),
                  details: notes || (isBroken ? 'Reported broken' : 'Returned')
                },
                ...eq.history
              ]
            };
          })
        }));
      },

      getEquipment: (id) => get().equipment.find((e) => e.id === id),
      
      reset: () => set({ equipment: INITIAL_DATA })
    }),
    {
      name: 'equipment-storage',
    }
  )
);
