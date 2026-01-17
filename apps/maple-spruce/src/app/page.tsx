import Link from 'next/link';
import { Box, Typography, Button, Container, Stack } from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import PeopleIcon from '@mui/icons-material/People';

export default function Index() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
        <Typography variant="h2" component="h1" gutterBottom>
          Maple & Spruce
        </Typography>
        <Typography variant="h5" color="text.secondary" sx={{ mb: 4 }}>
          Folk Arts Collective
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
          <Button
            component={Link}
            href="/inventory"
            variant="contained"
            size="large"
            startIcon={<InventoryIcon />}
            sx={{ px: 4, py: 1.5 }}
          >
            Manage Inventory
          </Button>
          <Button
            component={Link}
            href="/artists"
            variant="contained"
            size="large"
            startIcon={<PeopleIcon />}
            sx={{ px: 4, py: 1.5 }}
          >
            Manage Artists
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}
