import { db } from "./db";
import { equipment as equipmentTable } from "@shared/schema";

const INITIAL_DATA = [
  {
    id: 'EG1616',
    name: '0-100psi Transducer',
    category: 'Transducer',
    systemColor: 'Blue',
    status: 'available',
    notes: 'Standard Blue System Transducer'
  },
  {
    id: 'EG1617',
    name: 'Data Acquisition Module',
    category: 'DAQ',
    systemColor: 'Blue',
    status: 'available',
    notes: ''
  },
  {
    id: 'EG1618',
    name: '0-100psi Transducer',
    category: 'Transducer',
    systemColor: 'Red',
    status: 'available',
    notes: ''
  },
  {
    id: 'EG1619',
    name: '0-100psi Transducer (Spare)',
    category: 'Transducer',
    status: 'available',
    notes: ''
  },
  {
    id: 'EQ-001',
    name: 'Fluke 87V Multimeter',
    category: 'Measurement',
    status: 'available',
    notes: 'Calibrated last month'
  },
  {
    id: 'EQ-002',
    name: 'Tektronix Oscilloscope',
    category: 'Analysis',
    status: 'available',
    notes: ''
  },
  {
    id: 'EQ-003',
    name: 'Hydraulic Pressure Gauge',
    category: 'Pressure',
    status: 'broken',
    notes: 'Leaking seal on connector'
  },
  {
    id: 'EQ-004',
    name: 'Thermal Camera T540',
    category: 'Imaging',
    status: 'available',
    notes: ''
  },
  {
    id: 'EQ-005',
    name: 'Vibration Analyzer',
    category: 'Analysis',
    status: 'available',
    notes: ''
  }
];

async function seed() {
  try {
    console.log("Seeding database...");
    
    // Clear existing data
    await db.delete(equipmentTable);
    
    // Insert initial data
    for (const item of INITIAL_DATA) {
      await db.insert(equipmentTable).values(item);
    }
    
    console.log("Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seed();
