'use client';

import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Artist, Product } from '@maple/ts/domain';
import {
  RecordSaleDialog,
  SalesDataTable,
  SalesFilterToolbar,
  SalesSummaryCards,
  defaultSalesFilters,
  type SalesFilters,
} from '../../../components/sales';
import { useArtists, useProducts, useSales } from '../../../hooks';

export default function SalesPage() {
  const [filters, setFilters] = useState<SalesFilters>(defaultSalesFilters);
  const [recordOpen, setRecordOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const { salesState, recordSale, fetchSales } = useSales({
    artistId: filters.artistId || undefined,
    source: filters.source || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  });

  const { artistsState } = useArtists();
  const { productsState } = useProducts();

  const artists = useMemo(
    () => (artistsState.status === 'success' ? artistsState.data : []),
    [artistsState]
  );
  const products = useMemo(
    () => (productsState.status === 'success' ? productsState.data : []),
    [productsState]
  );

  const artistMap = useMemo(
    () => new Map<string, Artist>(artists.map((a) => [a.id, a])),
    [artists]
  );
  const productMap = useMemo(
    () => new Map<string, Product>(products.map((p) => [p.id, p])),
    [products]
  );

  const sales = salesState.status === 'success' ? salesState.data : [];

  const handleRecord = async (
    request: Parameters<typeof recordSale>[0]
  ): Promise<void> => {
    setIsRecording(true);
    try {
      await recordSale(request);
      // Refetch so totals reflect the new sale even if the optimistic
      // prepend missed a filter window.
      await fetchSales();
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Sales
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setRecordOpen(true)}
        >
          Record Sale
        </Button>
      </Box>

      <SalesSummaryCards sales={sales} />

      <SalesFilterToolbar
        filters={filters}
        onFiltersChange={setFilters}
        artists={artists}
        totalCount={sales.length}
      />

      <SalesDataTable
        salesState={salesState}
        productMap={productMap}
        artistMap={artistMap}
      />

      <RecordSaleDialog
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSubmit={handleRecord}
        products={products}
        isSubmitting={isRecording}
      />
    </>
  );
}
