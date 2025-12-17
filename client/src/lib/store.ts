import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';

export type EquipmentStatus = 'available' | 'checked_out' | 'broken';

export interface Equipment {
  id: string; // The "QR Code"
  name: string;
  category: string;
  systemColor?: string;
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
  checkOutSystem: (systemColor: string, equipmentIds: string[], workOrder: string, techName: string) => void;
  checkInByWorkOrder: (workOrder: string, itemReports: Record<string, { isBroken: boolean; notes: string }>) => void;
  updateEquipmentSystem: (id: string, newSystemColor: string) => void;
  addEquipment: (equipment: Omit<Equipment, 'history' | 'status'>) => void;
  getEquipment: (id: string) => Equipment | undefined;
  reset: () => void;
}

const INITIAL_DATA: Equipment[] = [
  {
    id: 'EG1616',
    name: '0-100psi Transducer',
    category: 'Transducer',
    systemColor: 'Blue',
    status: 'available',
    history: [],
    notes: 'Standard Blue System Transducer'
  },
  {
    id: 'EG1617',
    name: 'Data Acquisition Module',
    category: 'DAQ',
    systemColor: 'Blue',
    status: 'available',
    history: [],
  },
  {
    id: 'EG1618',
    name: '0-100psi Transducer',
    category: 'Transducer',
    systemColor: 'Red', // Another system
    status: 'available',
    history: [],
  },
  {
    id: 'EG1619',
    name: '0-100psi Transducer (Spare)',
    category: 'Transducer',
    // No system color - it's a spare
    status: 'available',
    history: [],
  },
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

      checkOutSystem: (systemColor, equipmentIds, workOrder, techName) => {
        set((state) => ({
          equipment: state.equipment.map((eq) => {
            // If the equipment is in the list of IDs to checkout
            if (equipmentIds.includes(eq.id)) {
               return {
                ...eq,
                status: 'checked_out',
                systemColor: systemColor, // Ensure it's marked with this system (handling swaps)
                workOrder,
                checkedOutBy: techName,
                checkedOutAt: new Date().toISOString(),
                history: [
                  {
                    action: 'check_out',
                    timestamp: new Date().toISOString(),
                    workOrder,
                    details: `Checked out as part of ${systemColor} System by ${techName}`
                  },
                  ...eq.history
                ]
              };
            }
            return eq;
          })
        }));
      },

      checkInByWorkOrder: (workOrder, itemReports) => {
        set((state) => ({
          equipment: state.equipment.map((eq) => {
            // Only affect items with this work order that are currently checked out
            if (eq.workOrder !== workOrder || eq.status !== 'checked_out') return eq;

            const report = itemReports[eq.id] || { isBroken: false, notes: '' };
            const newStatus = report.isBroken ? 'broken' : 'available';
            const action = report.isBroken ? 'report_broken' : 'check_in';
            const notes = report.notes || (report.isBroken ? 'Reported broken during system check-in' : 'Returned via system check-in');

            return {
              ...eq,
              status: newStatus,
              workOrder: undefined,
              checkedOutBy: undefined,
              checkedOutAt: undefined,
              notes: notes, // Update notes
              history: [
                {
                  action,
                  timestamp: new Date().toISOString(),
                  details: notes,
                  workOrder // Record which WO it came back from
                },
                ...eq.history
              ]
            };
          })
        }));
      },

      updateEquipmentSystem: (id, newSystemColor) => {
        set((state) => ({
          equipment: state.equipment.map((eq) => 
            eq.id === id ? { ...eq, systemColor: newSystemColor } : eq
          )
        }));
      },

      addEquipment: (newEquipment) => {
        set((state) => ({
          equipment: [
            ...state.equipment,
            {
              ...newEquipment,
              status: 'available',
              history: [],
              notes: ''
            }
          ]
        }));
      },

      getEquipment: (id) => get().equipment.find((e) => e.id === id),
      
      reset: () => set({ equipment: INITIAL_DATA })
    }),
    {
      name: 'equipment-storage-v2',
    }
  )
);
