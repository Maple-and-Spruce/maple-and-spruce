'use client';

import { useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Alert,
  IconButton,
  Typography,
  Paper,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Radio,
  RadioGroup,
  FormLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type {
  AgreementTemplate,
  AgreementSection,
  AgreementSectionResponseType,
  SigningRequirement,
  ClassCategory,
} from '@maple/ts/domain';
import {
  useSignal,
  useComputed,
  batch,
  useSignals,
} from '@maple/react/signals';

interface SectionFormData {
  id: string;
  title: string;
  content: string;
  responseType: AgreementSectionResponseType | '';
}

interface AgreementTemplateFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    sections: AgreementSection[];
    classCategoryIds: string[];
    autoAttach: boolean;
    signingRequirement: SigningRequirement;
    supportsMinor: boolean;
  }) => Promise<void>;
  template?: AgreementTemplate;
  classCategories: ClassCategory[];
  isSubmitting?: boolean;
}

let sectionCounter = 0;
function generateSectionId(): string {
  sectionCounter += 1;
  return `section-${Date.now()}-${sectionCounter}`;
}

export function AgreementTemplateForm({
  open,
  onClose,
  onSubmit,
  template,
  classCategories,
  isSubmitting = false,
}: AgreementTemplateFormProps) {
  useSignals();

  const name = useSignal('');
  const description = useSignal('');
  const autoAttach = useSignal(false);
  const signingRequirement = useSignal<SigningRequirement>('deferred');
  const supportsMinor = useSignal(false);
  const classCategoryIds = useSignal<string[]>([]);
  const sections = useSignal<SectionFormData[]>([]);

  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  const validationErrors = useComputed(() => {
    if (!showValidationErrors.value) return {} as Record<string, string>;
    const errors: Record<string, string> = {};
    if (!name.value.trim()) errors.name = 'Name is required';
    if (sections.value.length === 0) errors.sections = 'At least one section is required';
    for (let i = 0; i < sections.value.length; i++) {
      const s = sections.value[i];
      if (!s.title.trim()) errors[`section-${i}-title`] = 'Title is required';
      if (!s.content.trim()) errors[`section-${i}-content`] = 'Content is required';
    }
    return errors;
  });

  // Initialize form when opening
  useEffect(() => {
    if (!open) return;

    if (template) {
      batch(() => {
        name.value = template.name;
        description.value = template.description ?? '';
        autoAttach.value = template.autoAttach;
        signingRequirement.value = template.signingRequirement ?? 'deferred';
        supportsMinor.value = template.supportsMinor;
        classCategoryIds.value = [...template.classCategoryIds];
        sections.value = template.sections.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
          responseType: s.responseType ?? '',
        }));
        showValidationErrors.value = false;
        submitError.value = null;
      });
    } else {
      batch(() => {
        name.value = '';
        description.value = '';
        autoAttach.value = false;
        signingRequirement.value = 'deferred';
        supportsMinor.value = false;
        classCategoryIds.value = [];
        sections.value = [];
        showValidationErrors.value = false;
        submitError.value = null;
      });
    }
  }, [open, template]);

  const addSection = useCallback(() => {
    sections.value = [
      ...sections.value,
      { id: generateSectionId(), title: '', content: '', responseType: '' },
    ];
  }, [sections]);

  const removeSection = useCallback(
    (index: number) => {
      sections.value = sections.value.filter((_, i) => i !== index);
    },
    [sections]
  );

  const moveSection = useCallback(
    (index: number, direction: -1 | 1) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= sections.value.length) return;
      const arr = [...sections.value];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      sections.value = arr;
    },
    [sections]
  );

  const updateSection = useCallback(
    (index: number, field: keyof SectionFormData, value: string) => {
      sections.value = sections.value.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      );
    },
    [sections]
  );

  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;

    const errors = validationErrors.peek();
    if (Object.keys(errors).length > 0) return;

    submitError.value = null;

    try {
      await onSubmit({
        name: name.value.trim(),
        description: description.value.trim() || undefined,
        sections: sections.value.map((s) => ({
          id: s.id,
          title: s.title.trim(),
          content: s.content.trim(),
          responseType: (s.responseType || undefined) as AgreementSectionResponseType | undefined,
        })),
        classCategoryIds: classCategoryIds.value,
        autoAttach: autoAttach.value,
        signingRequirement: signingRequirement.value,
        supportsMinor: supportsMinor.value,
      });
    } catch (error: unknown) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to save template';
    }
  }, [onSubmit, name, description, sections, classCategoryIds, autoAttach, supportsMinor, validationErrors]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {template ? 'Edit Template' : 'Create Agreement Template'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          <TextField
            label="Template Name"
            value={name.value}
            onChange={(e) => (name.value = e.target.value)}
            error={!!validationErrors.value.name}
            helperText={validationErrors.value.name || 'e.g., "Stained Glass Liability Waiver"'}
            required
            fullWidth
          />

          <TextField
            label="Description (internal)"
            value={description.value}
            onChange={(e) => (description.value = e.target.value)}
            fullWidth
            placeholder="Optional admin notes about this template"
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoAttach.value}
                  onChange={(e) => (autoAttach.value = e.target.checked)}
                />
              }
              label="Auto-attach to registrations"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={supportsMinor.value}
                  onChange={(e) => (supportsMinor.value = e.target.checked)}
                />
              }
              label="Supports minor/guardian"
            />
          </Box>

          {autoAttach.value && (
            <>
              <FormControl fullWidth>
                <InputLabel>Class Categories</InputLabel>
                <Select
                  multiple
                  value={classCategoryIds.value}
                  label="Class Categories"
                  onChange={(e) => {
                    classCategoryIds.value = e.target.value as string[];
                  }}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((id) => {
                        const cat = classCategories.find((c) => c.id === id);
                        return (
                          <Chip key={id} label={cat?.name ?? id} size="small" />
                        );
                      })}
                    </Box>
                  )}
                >
                  {classCategories.map((cat) => (
                    <MenuItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Signing Requirement</FormLabel>
                <RadioGroup
                  value={signingRequirement.value}
                  onChange={(e) => {
                    signingRequirement.value = e.target.value as SigningRequirement;
                  }}
                >
                  <FormControlLabel
                    value="required"
                    control={<Radio size="small" />}
                    label="Required at checkout — must sign before payment"
                  />
                  <FormControlLabel
                    value="deferred"
                    control={<Radio size="small" />}
                    label="Deferred — sign later via emailed link"
                  />
                </RadioGroup>
              </FormControl>
            </>
          )}

          <Divider />

          {/* Sections */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Sections</Typography>
            <Button startIcon={<AddIcon />} onClick={addSection} size="small">
              Add Section
            </Button>
          </Box>

          {validationErrors.value.sections && (
            <Alert severity="error">{validationErrors.value.sections}</Alert>
          )}

          {sections.value.map((section, index) => (
            <Paper key={section.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Section {index + 1}
                </Typography>
                <Box>
                  <IconButton
                    size="small"
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => moveSection(index, 1)}
                    disabled={index === sections.value.length - 1}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => removeSection(index)}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>

              <TextField
                label="Section Title"
                value={section.title}
                onChange={(e) => updateSection(index, 'title', e.target.value)}
                error={!!validationErrors.value[`section-${index}-title`]}
                helperText={validationErrors.value[`section-${index}-title`]}
                required
                fullWidth
                size="small"
                sx={{ mb: 1.5 }}
              />

              <TextField
                label="Content (HTML)"
                value={section.content}
                onChange={(e) => updateSection(index, 'content', e.target.value)}
                error={!!validationErrors.value[`section-${index}-content`]}
                helperText={validationErrors.value[`section-${index}-content`] || 'HTML content for this section'}
                required
                fullWidth
                multiline
                minRows={4}
                maxRows={12}
                size="small"
                sx={{ mb: 1.5 }}
              />

              <FormControl fullWidth size="small">
                <InputLabel>Response Type (optional)</InputLabel>
                <Select
                  value={section.responseType}
                  label="Response Type (optional)"
                  onChange={(e) =>
                    updateSection(index, 'responseType', e.target.value)
                  }
                >
                  <MenuItem value="">None</MenuItem>
                  <MenuItem value="acknowledgment">Acknowledgment (checkbox)</MenuItem>
                  <MenuItem value="media-release">Media Release (3 radio options)</MenuItem>
                </Select>
              </FormControl>
            </Paper>
          ))}

          {sections.value.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              <Typography variant="body2">
                No sections yet. Click "Add Section" to start building the agreement.
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : template ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
