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

export function useEquipment() {
  return useQuery({
    queryKey: ['equipment'],
    queryFn: api.equipment.getAll,
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
export function useSystems() {
  return useQuery({
    queryKey: ['systems'],
    queryFn: api.systems.getAll,
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

export function useSystemConfigs() {
  return useQuery({
    queryKey: ['system-configs'],
    queryFn: api.systemConfigs.getAll,
  });
}

export function useSaveSystemConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ systemColor, data }: { systemColor: string; data: InsertSystemConfig }) =>
      api.systemConfigs.save(systemColor, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-configs'] });
    },
  });
}

export function useStagedSystems() {
  return useQuery({
    queryKey: ['staged-systems'],
    queryFn: api.stagedSystems.getAll,
  });
}

export function useSaveStagedSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ systemColor, data }: { systemColor: string; data: InsertStagedSystem }) =>
      api.stagedSystems.save(systemColor, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });
}

export function useClearStagedSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (systemColor: string) => api.stagedSystems.clear(systemColor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staged-systems'] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
  });
}

export function useOutageLocationNotes() {
  return useQuery({
    queryKey: ['outage-location-notes'],
    queryFn: api.outageBoard.getLocationNotes,
  });
}

export function useSaveOutageLocationNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ location, data }: { location: string; data: InsertOutageLocationNote }) =>
      api.outageBoard.saveLocationNote(location, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outage-location-notes'] });
    },
  });
}

export function useActiveOutage() {
  return useQuery({
    queryKey: ['active-outage'],
    queryFn: api.outageBoard.getActive,
  });
}

export function useSaveActiveOutage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InsertActiveOutage) => api.outageBoard.saveActive(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-outage'] });
    },
  });
}

export function useClearActiveOutage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.outageBoard.clearActive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-outage'] });
    },
  });
}
