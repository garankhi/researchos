'use client';

import { useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDemoControllerGetFail,
  useDemoControllerGetSlow,
  useDemoControllerGetUnstable,
  useHealthControllerCheck,
} from '@/lib/api';
import {
  EmptyState,
  ErrorState,
  ListItemSkeleton,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { apiErrorMessage } from '@/lib/api-error';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Exercises the generated API client end to end.
 *
 * The hooks here come from Orval, which generates them from
 * `apps/api/openapi.json`. If that chain breaks (spec not regenerated, client
 * not regenerated, wrong base URL), these panels stop working.
 *
 * Note on state flags: for the manually triggered queries `enabled` is
 * `false`, so `isPending` is `true` forever — a query that has never run has
 * status "pending". Use `isFetching` to mean "a request is in flight" and
 * `isSuccess` / `isError` to mean "a request already completed".
 */
export function ApiSection() {
  const queryClient = useQueryClient();
  const [slowDelay, setSlowDelay] = useState(3000);

  const health = useHealthControllerCheck();
  const slow = useDemoControllerGetSlow(
    { delay: String(slowDelay) },
    { query: { enabled: false } },
  );
  const failing = useDemoControllerGetFail({
    query: { enabled: false, retry: false },
  });
  const unstable = useDemoControllerGetUnstable({
    query: { enabled: false, retry: false },
  });

  return (
    <DemoSection
      id="api"
      title="API client (Orval + TanStack Query)"
      description="Every button below calls a real endpoint on apps/api through the Orval-generated hooks."
    >
      <Stack spacing={3}>
        <Box>
          <DemoRow label="GET /health">
            <Button
              size="small"
              variant="contained"
              disabled={health.isFetching}
              onClick={() => void health.refetch()}
            >
              {health.isFetching ? 'Đang tải…' : 'Gọi lại'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void queryClient.invalidateQueries()}
            >
              Invalidate toàn bộ
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => queryClient.removeQueries()}
            >
              Xóa cache
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {health.isPending ? (
              <LoadingSkeleton variant="text" width={200} />
            ) : health.isError ? (
              <ErrorState
                title="Không kết nối được API"
                message="Hãy chắc chắn apps/api đang chạy tại cổng 4000."
                onRetry={() => void health.refetch()}
              />
            ) : (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip label="thành công" color="success" size="small" />
                <Typography variant="body2">
                  {health.data?.status} — {health.data?.service}
                </Typography>
              </Stack>
            )}
          </Box>
        </Box>

        <Box>
          <DemoRow label="GET /demo/slow">
            <Button
              size="small"
              variant="contained"
              disabled={slow.isFetching}
              onClick={() => void slow.refetch()}
            >
              {slow.isFetching ? 'Đang tải…' : `Tải sau ${slowDelay}ms`}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setSlowDelay((d) => (d === 3000 ? 8000 : 3000))}
            >
              Đổi độ trễ
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {slow.isFetching ? (
              <ListItemSkeleton />
            ) : slow.isError ? (
              <ErrorState
                title="Tải thất bại"
                message={apiErrorMessage(slow.error)}
                onRetry={() => void slow.refetch()}
              />
            ) : slow.isSuccess ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip label="thành công" color="success" size="small" />
                <Typography variant="body2">{slow.data}</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Chưa gọi — bấm nút để gửi request.
              </Typography>
            )}
          </Box>
          <DemoNote>
            Bấm rồi điều hướng đi nơi khác trước khi response về: request sẽ bị
            huỷ và component không báo lỗi.
          </DemoNote>
        </Box>

        <Box>
          <DemoRow label="GET /demo/fail">
            <Button
              size="small"
              color="error"
              variant="contained"
              disabled={failing.isFetching}
              onClick={() => void failing.refetch()}
            >
              {failing.isFetching ? 'Đang tải…' : 'Gọi endpoint lỗi'}
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {failing.isFetching ? (
              <LoadingSkeleton variant="text" width={200} />
            ) : failing.isError ? (
              <ErrorState
                title="Tải thất bại (expected)"
                message={apiErrorMessage(failing.error)}
                onRetry={() => void failing.refetch()}
              />
            ) : failing.isSuccess ? (
              <EmptyState
                title="Không có lỗi"
                message="Endpoint lỡ trả về thành công."
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Chưa gọi — bấm nút để gửi request.
              </Typography>
            )}
          </Box>
          <DemoNote>
            Endpoint này dùng `retry: false` để lỗi hiện ra ngay. Mặc định
            TanStack Query retry 3 lần với backoff luỹ thừa.
          </DemoNote>
        </Box>

        <Box>
          <DemoRow label="GET /demo/unstable">
            <Button
              size="small"
              variant="outlined"
              disabled={unstable.isFetching}
              onClick={() => void unstable.refetch()}
            >
              {unstable.isFetching ? 'Đang tải…' : 'Gọi ngẫu nhiên'}
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {unstable.isFetching ? (
              <LoadingSkeleton variant="text" width={200} />
            ) : unstable.isError ? (
              <ErrorState
                title="Lần này thất bại"
                message={apiErrorMessage(unstable.error)}
                onRetry={() => void unstable.refetch()}
              />
            ) : unstable.isSuccess ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip label="thành công" color="success" size="small" />
                <Typography variant="body2">{unstable.data}</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Chưa gọi — bấm nút để gửi request.
              </Typography>
            )}
          </Box>
        </Box>
      </Stack>
    </DemoSection>
  );
}
