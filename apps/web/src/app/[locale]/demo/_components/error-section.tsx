'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import ErrorBoundary from '@/components/ui/error-boundary';
import { ErrorState } from '@/components/ui/feedback';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Throws once per "arm" so the component-level boundary can be tested.
 *
 * The throw happens in an effect rather than during render. React Compiler
 * memoizes components whose props do not change, so a render-phase throw
 * keyed on a stable ref would never re-run after the first render. An effect
 * keyed on `version` re-runs whenever the parent arms a new throw.
 *
 * The flag lives in the parent so it survives the unmount that the error
 * boundary performs when it swaps in its fallback. Consuming the flag inside
 * the effect means a `retry()` remount does not throw again.
 */
function Boom({
  armedRef,
  version,
}: {
  armedRef: React.RefObject<boolean>;
  version: number;
}) {
  useEffect(() => {
    if (armedRef.current) {
      armedRef.current = false;
      throw new Error('Lỗi cố ý từ component demo');
    }
  }, [armedRef, version]);

  return (
    <Typography variant="body2" color="success.main">
      Component đang hoạt động bình thường.
    </Typography>
  );
}

export function ErrorSection() {
  const armedRef = useRef(false);
  const [version, setVersion] = useState(0);

  const arm = () => {
    armedRef.current = true;
    setVersion((v) => v + 1);
  };

  return (
    <DemoSection
      id="error"
      title="Error states"
      description="Mỗi lỗi phải nói rõ lỗi gì và luôn có đường đi tiếp."
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            ErrorState dùng chung (có nút thử lại)
          </Typography>
          <ErrorState
            title="Không tải được dữ liệu"
            message="Mô tả cụ thể: máy chủ từ chối kết nối sau 3 lần thử."
            onRetry={() => undefined}
          />
        </Box>

        <Box>
          <DemoRow label="Component boundary">
            <Button
              size="small"
              variant="contained"
              color="error"
              onClick={arm}
            >
              Ném lỗi
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            <ErrorBoundary title="Lỗi ở cấp component">
              <Boom armedRef={armedRef} version={version} />
            </ErrorBoundary>
          </Box>
          <DemoNote>
            Ném lỗi một lần; nút “Thử lại” trong boundary gọi `retry()` và
            component hoạt động trở lại. Boundary dùng `catchError` từ
            `next/error`: `redirect()` và `notFound()` vẫn đi xuyên qua thay vì
            bị nuốt thành lỗi chung.
          </DemoNote>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Lỗi cấp route (app/error.tsx) — dùng nút bên dưới
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="error"
            component="a"
            href="/demo/crash"
          >
            Mở route lỗi cấp route
          </Button>
        </Box>
      </Stack>
    </DemoSection>
  );
}
