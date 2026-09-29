'use client';

/**
 * The studio's EMA portal products (WV Hope Scholarship), kept in step with the
 * portal by hand.
 *
 * Each row is what EMA pays per lesson for one approved product. A Hope student
 * is put on one of these, and that price is what their lessons are worth in the
 * queue, on the claim and in teacher payouts. The table mirrors the portal's
 * own columns (ID, name, price) so the two can be checked side by side.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import type {
  HopeProduct,
  RequestState,
  SaveHopeProductInput,
} from '@maple/ts/domain';
import { formatHopePrice } from '@maple/ts/domain';
import { hopeProductValidation } from '@maple/ts/validation';

export interface HopeProductsCardProps {
  productsState: RequestState<HopeProduct[]>;
  isSaving?: boolean;
  onSave: (input: SaveHopeProductInput) => Promise<unknown>;
}

interface Draft {
  id?: string;
  emaProductId: string;
  name: string;
  price: string;
  active: boolean;
}

const EMPTY: Draft = { emaProductId: '', name: '', price: '', active: true };

function toInput(draft: Draft): SaveHopeProductInput {
  return {
    id: draft.id,
    emaProductId: draft.emaProductId.trim(),
    name: draft.name.trim(),
    priceCents: Math.round(parseFloat(draft.price) * 100),
    active: draft.active,
  };
}

function ProductDialog({
  draft,
  isSaving,
  onClose,
  onSave,
}: {
  draft: Draft;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: SaveHopeProductInput) => Promise<unknown>;
}) {
  const [value, setValue] = useState(draft);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = hopeProductValidation(toInput(value));
  const fieldError = (field: string) =>
    showErrors ? result.getErrors(field)[0] : undefined;

  const submit = async () => {
    setShowErrors(true);
    if (result.hasErrors()) return;
    setError(null);
    try {
      await onSave(toInput(value));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the product');
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{draft.id ? 'Edit EMA product' : 'Add an EMA product'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Copy these from Products &amp; Services in the EMA portal, exactly as
            they appear there.
          </Typography>
          <TextField
            label="EMA product ID"
            value={value.emaProductId}
            onChange={(e) => setValue({ ...value, emaProductId: e.target.value })}
            error={Boolean(fieldError('emaProductId'))}
            helperText={fieldError('emaProductId')}
          />
          <TextField
            label="Name"
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
            error={Boolean(fieldError('name'))}
            helperText={fieldError('name')}
          />
          <TextField
            label="Price per lesson"
            type="number"
            value={value.price}
            onChange={(e) => setValue({ ...value, price: e.target.value })}
            error={Boolean(fieldError('priceCents'))}
            helperText={fieldError('priceCents')}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              },
              htmlInput: { min: 0, step: '0.01' },
            }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={value.active}
                onChange={(e) => setValue({ ...value, active: e.target.checked })}
              />
            }
            label="Offered for new students"
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function HopeProductsCard({
  productsState,
  isSaving = false,
  onSave,
}: HopeProductsCardProps) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const loaded = productsState.status === 'success';

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant="h6" component="h2">
          EMA products
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          disabled={!loaded}
          onClick={() => setEditing(EMPTY)}
        >
          Add product
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        What the EMA portal pays per lesson. Each Hope student is billed under
        one of these, set on the student.
      </Typography>

      {(productsState.status === 'idle' || productsState.status === 'loading') && (
        <Box aria-busy="true" aria-label="Loading EMA products">
          <Skeleton variant="rectangular" height={120} />
        </Box>
      )}
      {productsState.status === 'error' && (
        <Alert severity="error">
          Could not load EMA products: {productsState.error}
        </Alert>
      )}
      {loaded && productsState.data.length === 0 && (
        <Alert severity="info">
          No EMA products yet. Add each product from the portal so Hope lessons
          are priced at what EMA actually pays.
        </Alert>
      )}
      {loaded && productsState.data.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>EMA ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {productsState.data.map((product) => (
              <TableRow key={product.id}>
                <TableCell>{product.emaProductId}</TableCell>
                <TableCell>
                  {product.name}
                  {!product.active && (
                    <Chip size="small" label="Retired" sx={{ ml: 1 }} />
                  )}
                </TableCell>
                <TableCell align="right">
                  {formatHopePrice(product.priceCents)}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      aria-label={`Edit ${product.name}`}
                      onClick={() =>
                        setEditing({
                          id: product.id,
                          emaProductId: product.emaProductId,
                          name: product.name,
                          price: (product.priceCents / 100).toFixed(2),
                          active: product.active,
                        })
                      }
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <ProductDialog
          draft={editing}
          isSaving={isSaving}
          onClose={() => setEditing(null)}
          onSave={onSave}
        />
      )}
    </Paper>
  );
}
