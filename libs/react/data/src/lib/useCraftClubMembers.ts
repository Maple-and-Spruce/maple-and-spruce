'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  CraftClubMember,
  CraftClubMemberStatus,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetCraftClubMembersRequest,
  GetCraftClubMembersResponse,
  ApproveCraftClubMemberRequest,
  ApproveCraftClubMemberResponse,
  UpdateCraftClubMemberRequest,
  UpdateCraftClubMemberResponse,
  AdminCraftClubSubscriptionActionRequest,
  AdminCraftClubSubscriptionActionResponse,
} from '@maple/ts/firebase/api-types';

export type CraftClubSubscriptionAction = 'pause' | 'resume' | 'cancel';

const ACTION_FUNCTIONS: Record<CraftClubSubscriptionAction, string> = {
  pause: 'adminPauseCraftClubSubscription',
  resume: 'adminResumeCraftClubSubscription',
  cancel: 'adminCancelCraftClubSubscription',
};

export interface UseCraftClubMembersFilters {
  status?: CraftClubMemberStatus;
}

export function useCraftClubMembers(filters?: UseCraftClubMembersFilters) {
  const [membersState, setMembersState] = useState<
    RequestState<CraftClubMember[]>
  >({ status: 'idle' });

  const fetchMembers = useCallback(async () => {
    setMembersState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getMembers = httpsCallable<
        GetCraftClubMembersRequest,
        GetCraftClubMembersResponse
      >(functions, 'getCraftClubMembers');
      const result = await getMembers({ status: filters?.status });
      setMembersState({ status: 'success', data: result.data.members });
    } catch (error) {
      console.error('Failed to fetch Craft Club members:', error);
      setMembersState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch members',
      });
    }
  }, [filters?.status]);

  const approveMember = useCallback(
    async (
      input: ApproveCraftClubMemberRequest
    ): Promise<CraftClubMember> => {
      const functions = getMapleFunctions();
      const approve = httpsCallable<
        ApproveCraftClubMemberRequest,
        ApproveCraftClubMemberResponse
      >(functions, 'approveCraftClubMember');
      const result = await approve(input);
      const member = result.data.member;
      // Upsert: replace an existing record or prepend a brand-new one.
      setMembersState((prev) => {
        if (prev.status !== 'success') return prev;
        const exists = prev.data.some((m) => m.id === member.id);
        return {
          ...prev,
          data: exists
            ? prev.data.map((m) => (m.id === member.id ? member : m))
            : [member, ...prev.data],
        };
      });
      return member;
    },
    []
  );

  const updateMember = useCallback(
    async (input: UpdateCraftClubMemberRequest): Promise<CraftClubMember> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateCraftClubMemberRequest,
        UpdateCraftClubMemberResponse
      >(functions, 'updateCraftClubMember');
      const result = await update(input);
      const member = result.data.member;
      setMembersState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((m) => (m.id === member.id ? member : m)),
        };
      });
      return member;
    },
    []
  );

  const subscriptionAction = useCallback(
    async (
      action: CraftClubSubscriptionAction,
      id: string
    ): Promise<CraftClubMember> => {
      const functions = getMapleFunctions();
      const call = httpsCallable<
        AdminCraftClubSubscriptionActionRequest,
        AdminCraftClubSubscriptionActionResponse
      >(functions, ACTION_FUNCTIONS[action]);
      const result = await call({ id });
      const member = result.data.member;
      setMembersState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((m) => (m.id === member.id ? member : m)),
        };
      });
      return member;
    },
    []
  );

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return {
    membersState,
    fetchMembers,
    approveMember,
    updateMember,
    subscriptionAction,
  };
}
