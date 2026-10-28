'use client';

import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import {
  EmptyState,
  ListItemSkeleton,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Exercises the shared loading primitives.
 *
 * The real loading state is driven by the API section; here the same
 * primitives are rendered statically so their shape can be reviewed in
 * isolation.
 */
export function LoadingSection() {
  const [hidden, setHidden] = useState(false);

  return (
    <DemoSection
      id="loading"
      title="Loading states"
      description="Skeleton theo hình dạng nội dung, không dùng spinner — tránh layout shift."
    >
      <Stack spacing={3}>
        <Box>
          <DemoRow label="Text">
            <Button
              size="small"
              variant="outlined"
              onClick={() => setHidden((v) => !v)}
            >
              {hidden ? 'Hiện lại' : 'Ẩn đi'}
            </Button>
          </DemoRow>
          <Box sx={{ mt: 1.5 }}>
            {hidden ? (
              <Typography variant="body2" color="text.secondary">
                (Skeleton đã bị ẩn)
              </Typography>
            ) : (
              <>
                <LoadingSkeleton width={220} />
                <Box sx={{ mt: 1 }}>
                  <LoadingSkeleton variant="text" width="70%" />
                </Box>
              </>
            )}
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Rectangular + circular
          </Typography>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <LoadingSkeleton variant="rectangular" width={160} height={72} />
            <LoadingSkeleton variant="circular" width={56} height={56} />
          </Stack>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Nhiều dòng
          </Typography>
          <LoadingSkeleton count={4} />
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            List item
          </Typography>
          <ListItemSkeleton />
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Empty state (dữ liệu rỗng — không phải lỗi)
          </Typography>
          <EmptyState
            title="Chưa có kết quả"
            message="Bộ lọc hiện tại không khớp mục nào."
            action={
              <Button size="small" variant="outlined">
                Xóa bộ lọc
              </Button>
            }
          />
        </Box>

        <DemoNote>
          Skeleton phải giữ nguyên kích thước so với nội dung thật, nếu không
          trang sẽ nhảy layout khi dữ liệu tới.
        </DemoNote>
      </Stack>
    </DemoSection>
  );
}
