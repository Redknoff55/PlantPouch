import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { InsertEquipment } from "@shared/schema";

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

export function useCheckoutSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      systemColor: string;
      equipmentIds: string[];
      workOrder: string;
      techName: string;
    }) => api.equipment.checkoutSystem(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
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
    },
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...params }: { id: string; workOrder: string; techName: string }) =>
      api.equipment.checkout(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
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
    },
  });
}
