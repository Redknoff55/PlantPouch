import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  InsertEquipment,
  InsertSystem,
  InsertSystemConfig,
  InsertStagedSystem,
  InsertOutageLocationNote,
  InsertActiveOutage,
} from "@shared/schema";

export function useEquipment(toolboxId?: string) {
  return useQuery({
    queryKey: ['equipment', toolboxId ?? 'all'],
    queryFn: () => api.equipment.getAll(toolboxId),
  });
}

export function useCreateEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsertEquipment) => api.equipment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });
}

export function useUpdateEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertEquipment> }) =>
      api.equipment.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });
}

export function useDeleteEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.equipment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });
}

export function useCheckoutSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      systemColor: string;
      equipmentIds: string[];
      workOrder: string;
      techName: string;
      valveNumber?: string;
    }) => api.equipment.checkoutSystem(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
    },
  });
}

export function useCheckinByWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      workOrder: string;
      itemReports: Record<string, { isBroken: boolean; notes: string }>;
    }) => api.equipment.checkinByWorkOrder(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
    },
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...params
    }: {
      id: string;
      workOrder: string;
      techName: string;
      valveNumber?: string;
    }) =>
      api.equipment.checkout(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
    },
  });
}

export function useCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...params }: { id: string; notes: string; isBroken: boolean }) =>
      api.equipment.checkin(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
    },
  });
}

// Systems hooks
export function useSystems(toolboxId?: string) {
  return useQuery({
    queryKey: ['systems', toolboxId ?? 'all'],
    queryFn: () => api.systems.getAll(toolboxId),
  });
}

export function useCreateSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsertSystem) => api.systems.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systems'] });
    },
  });
}

export function useUpdateSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<InsertSystem>) =>
      api.systems.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systems'] });
    },
  });
}

export function useDeleteSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.systems.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systems'] });
    },
  });
}

export function useSystemConfigs(toolboxId?: string) {
  return useQuery({
    queryKey: ['system-configs', toolboxId ?? 'all'],
    queryFn: () => api.systemConfigs.getAll(toolboxId),
  });
}

export function useSaveSystemConfig(toolboxId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ systemColor, data }: { systemColor: string; data: InsertSystemConfig }) =>
      api.systemConfigs.save(systemColor, { ...data, toolboxId: data.toolboxId ?? toolboxId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-configs'] });
    },
  });
}

export function useStagedSystems(toolboxId?: string) {
  return useQuery({
    queryKey: ['staged-systems', toolboxId ?? 'all'],
    queryFn: () => api.stagedSystems.getAll(toolboxId),
  });
}

export function useSaveStagedSystem(toolboxId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ systemColor, data }: { systemColor: string; data: InsertStagedSystem }) =>
      api.stagedSystems.save(systemColor, { ...data, toolboxId: data.toolboxId ?? toolboxId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });
}

export function useClearStagedSystem(toolboxId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (systemColor: string) => api.stagedSystems.clear(systemColor, toolboxId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });
}

export function useOutageLocationNotes(toolboxId?: string) {
  return useQuery({
    queryKey: ['outage-location-notes', toolboxId ?? 'all'],
    queryFn: () => api.outageBoard.getLocationNotes(toolboxId),
  });
}

export function useSaveOutageLocationNote(toolboxId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ location, data }: { location: string; data: InsertOutageLocationNote }) =>
      api.outageBoard.saveLocationNote(location, { ...data, toolboxId: data.toolboxId ?? toolboxId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outage-location-notes'] });
    },
  });
}

export function useActiveOutage(toolboxId?: string) {
  return useQuery({
    queryKey: ['active-outage', toolboxId ?? 'unscoped'],
    queryFn: () => api.outageBoard.getActive(toolboxId),
  });
}

export function useActiveOutages() {
  return useQuery({
    queryKey: ['active-outages'],
    queryFn: api.outageBoard.getAllActive,
  });
}

export function useSaveActiveOutage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsertActiveOutage) => api.outageBoard.saveActive(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-outage'] });
      queryClient.invalidateQueries({ queryKey: ['active-outages'] });
    },
  });
}

export function useClearActiveOutage(toolboxId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.outageBoard.clearActive(toolboxId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-outage'] });
      queryClient.invalidateQueries({ queryKey: ['active-outages'] });
    },
  });
}
