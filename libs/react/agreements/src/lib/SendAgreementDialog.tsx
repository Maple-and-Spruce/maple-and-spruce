'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  useSignal,
  useSignals,
} from '@maple/react/signals';
import type { AgreementTemplate } from '@maple/ts/domain';

interface SendAgreementDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (data: {
    templateId: string;
    signerEmail: string;
    signerName: string;
    signerPhone?: string;
  }) => Promise<void>;
  templates: AgreementTemplate[];
  isSending: boolean;
}

export function SendAgreementDialog({
  open,
  onClose,
  onSend,
  templates,
  isSending,
}: SendAgreementDialogProps) {
  useSignals();

  const templateId = useSignal('');
  const signerName = useSignal('');
  const signerEmail = useSignal('');
  const signerPhone = useSignal('');
  const error = useSignal('');

  const handleClose = () => {
    templateId.value = '';
    signerName.value = '';
    signerEmail.value = '';
    signerPhone.value = '';
    error.value = '';
    onClose();
  };

  const handleSend = async () => {
    if (!templateId.value) {
      error.value = 'Please select a template';
      return;
    }
    if (!signerName.value.trim()) {
      error.value = 'Name is required';
      return;
    }
    if (!signerEmail.value.trim()) {
      error.value = 'Email is required';
      return;
    }

    error.value = '';
    try {
      await onSend({
        templateId: templateId.value,
        signerEmail: signerEmail.value.trim(),
        signerName: signerName.value.trim(),
        signerPhone: signerPhone.value.trim() || undefined,
      });
      handleClose();
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to send waiver';
    }
  };

  const activeTemplates = templates.filter((t) => t.status === 'active');

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send Waiver</DialogTitle>
      <DialogContent>
        {error.value && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error.value}
          </Alert>
        )}

        <FormControl fullWidth sx={{ mt: 1 }}>
          <InputLabel>Template</InputLabel>
          <Select
            value={templateId.value}
            label="Template"
            onChange={(e) => {
              templateId.value = e.target.value;
            }}
          >
            {activeTemplates.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Recipient Name"
          value={signerName.value}
          onChange={(e) => {
            signerName.value = e.target.value;
          }}
          fullWidth
          sx={{ mt: 2 }}
        />

        <TextField
          label="Recipient Email"
          type="email"
          value={signerEmail.value}
          onChange={(e) => {
            signerEmail.value = e.target.value;
          }}
          fullWidth
          sx={{ mt: 2 }}
        />

        <TextField
          label="Phone (optional)"
          value={signerPhone.value}
          onChange={(e) => {
            signerPhone.value = e.target.value;
          }}
          fullWidth
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={isSending}
        >
          {isSending ? <CircularProgress size={20} /> : 'Send'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
