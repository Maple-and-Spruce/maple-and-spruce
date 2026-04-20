'use client';

import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Skeleton,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { AgreementTemplate, RequestState } from '@maple/ts/domain';

interface AgreementTemplateListProps {
  templatesState: RequestState<AgreementTemplate[]>;
  onEdit: (template: AgreementTemplate) => void;
  onDelete: (template: AgreementTemplate) => void;
}

export function AgreementTemplateList({
  templatesState,
  onEdit,
  onDelete,
}: AgreementTemplateListProps) {
  if (
    templatesState.status === 'loading' ||
    templatesState.status === 'idle'
  ) {
    return (
      <Box sx={{ mt: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={60} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (templatesState.status === 'error') {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Failed to load templates: {templatesState.error}
      </Alert>
    );
  }

  const templates = templatesState.data;

  if (templates.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No agreement templates yet</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Create a template to start collecting waivers and agreements.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Sections</TableCell>
            <TableCell>Auto-Attach</TableCell>
            <TableCell>Version</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {templates.map((template) => (
            <TableRow key={template.id} hover>
              <TableCell>
                <Typography variant="body2" fontWeight={600}>
                  {template.name}
                </Typography>
                {template.description && (
                  <Typography variant="caption" color="text.secondary">
                    {template.description}
                  </Typography>
                )}
              </TableCell>
              <TableCell>{template.sections.length}</TableCell>
              <TableCell>
                {template.autoAttach ? (
                  <Chip label="Auto" size="small" color="primary" />
                ) : (
                  <Chip label="Manual" size="small" variant="outlined" />
                )}
              </TableCell>
              <TableCell>v{template.version}</TableCell>
              <TableCell>
                <Chip
                  label={template.status}
                  size="small"
                  color={
                    template.status === 'active' ? 'success' : 'default'
                  }
                />
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => onEdit(template)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => onDelete(template)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
