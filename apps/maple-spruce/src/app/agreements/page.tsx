'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import type { AgreementTemplate } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  AgreementTemplateList,
  AgreementRequestList,
  SendAgreementDialog,
} from '@maple/react/agreements';
import { AppShell } from '../../components/layout';
import { useAgreementTemplates, useAgreementRequests } from '../../hooks';

export default function AgreementsPage() {
  const [tab, setTab] = useState(0);

  const {
    templatesState,
    deleteTemplate: deleteTemplateApi,
  } = useAgreementTemplates();

  const {
    requestsState,
    sendRequest,
    resendRequest,
  } = useAgreementRequests();

  // Send dialog state
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Delete dialog state
  const [templateToDelete, setTemplateToDelete] =
    useState<AgreementTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Resend state
  const [isResending, setIsResending] = useState(false);

  const handleSendWaiver = useCallback(
    async (data: {
      templateId: string;
      signerEmail: string;
      signerName: string;
      signerPhone?: string;
    }) => {
      setIsSending(true);
      try {
        await sendRequest({
          ...data,
          deliveryMethod: 'email',
        });
      } finally {
        setIsSending(false);
      }
    },
    [sendRequest]
  );

  const handleResend = useCallback(
    async (id: string) => {
      setIsResending(true);
      try {
        await resendRequest(id);
      } catch (error) {
        console.error('Failed to resend:', error);
      } finally {
        setIsResending(false);
      }
    },
    [resendRequest]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!templateToDelete) return;
    setIsDeleting(true);
    try {
      await deleteTemplateApi(templateToDelete.id);
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [templateToDelete, deleteTemplateApi]);

  const handleEditTemplate = useCallback((_template: AgreementTemplate) => {
    // TODO: Open template editor dialog (Phase 4 enhancement)
    console.log('Edit template:', _template.id);
  }, []);

  const templates =
    templatesState.status === 'success' ? templatesState.data : [];

  return (
    <AppShell>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Agreements & Waivers
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<SendIcon />}
            onClick={() => setIsSendOpen(true)}
          >
            Send Waiver
          </Button>
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        sx={{ mb: 1 }}
      >
        <Tab label="Templates" />
        <Tab label="Requests" />
      </Tabs>

      {tab === 0 && (
        <AgreementTemplateList
          templatesState={templatesState}
          onEdit={handleEditTemplate}
          onDelete={setTemplateToDelete}
        />
      )}

      {tab === 1 && (
        <AgreementRequestList
          requestsState={requestsState}
          onResend={handleResend}
          isResending={isResending}
        />
      )}

      <SendAgreementDialog
        open={isSendOpen}
        onClose={() => setIsSendOpen(false)}
        onSend={handleSendWaiver}
        templates={templates}
        isSending={isSending}
      />

      <DeleteConfirmDialog
        open={!!templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Archive Template?"
        itemName={templateToDelete?.name ?? ''}
      />
    </AppShell>
  );
}
