import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { SearchOff } from '@mui/icons-material';
import NextLink from '@/components/ui/link';

/**
 * 404 UI for missing resources.
 *
 * Rendered when `notFound()` is called in the render path, and for URLs that
 * match no route. Next.js adds a `<meta name="robots" content="noindex" />`
 * tag when the 404 is streamed.
 */
export default function NotFound() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <SearchOff color="disabled" sx={{ fontSize: 48 }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          Không tìm thấy trang
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Trang bạn tìm không tồn tại, đã bị xóa hoặc đã được chuyển sang địa
          chỉ khác.
        </Typography>
        <Box>
          <Button variant="contained" component={NextLink} href="/">
            Về trang chủ
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
