'use client';

import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * A broad sample of MUI components, so a regression in the theme, the
 * emotion cache or the v9 prop surface shows up immediately.
 */
export function MuiSection() {
  return (
    <DemoSection
      id="mui"
      title="MUI components"
      description="Mẫu các component và variant để kiểm tra theme và emotion cache."
    >
      <Stack spacing={3}>
        <DemoRow label="Buttons">
          <Button variant="contained">Contained</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="text">Text</Button>
          <Button variant="contained" color="error">
            Error
          </Button>
          <Button variant="outlined" disabled>
            Disabled
          </Button>
        </DemoRow>

        <DemoRow label="Chips">
          <Chip label="Default" />
          <Chip label="Success" color="success" />
          <Chip label="Warning" color="warning" variant="outlined" />
          <Chip label="Deletable" onDelete={() => undefined} />
        </DemoRow>

        <DemoRow label="Inputs">
          <TextField label="Text" size="small" defaultValue="ResearchOS" />
          <TextField label="Disabled" size="small" disabled />
          <Switch defaultChecked />
        </DemoRow>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
            Typography
          </Typography>
          <Typography variant="h1">Heading 1</Typography>
          <Typography variant="h5">Heading 5</Typography>
          <Typography variant="subtitle1">Subtitle 1</Typography>
          <Typography variant="body1">
            Body 1 — dòng chữ chuẩn để đọc.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Body 2 — phụ, dùng cho mô tả.
          </Typography>
          <Typography variant="caption" color="text.tertiary">
            Caption — chú thích nhỏ.
          </Typography>
        </Box>

        <Divider />

        <Stack spacing={2}>
          <Alert severity="success">
            <AlertTitle>Thành công</AlertTitle>
            Thông báo thành công.
          </Alert>
          <Alert severity="warning">
            <AlertTitle>Cảnh báo</AlertTitle>
            Thông báo cảnh báo.
          </Alert>
          <Alert severity="info">Thông tin bổ sung.</Alert>
        </Stack>

        <DemoNote>
          MUI v9 bỏ các system props (gap, flex, py, px, alignItems) khỏi prop
          surface trực tiếp — chúng phải đi qua `sx`, nếu không sẽ lọt ra DOM
          dưới dạng HTML attribute không hợp lệ.
        </DemoNote>
      </Stack>
    </DemoSection>
  );
}
