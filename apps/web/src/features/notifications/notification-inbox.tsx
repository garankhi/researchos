'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Container,
  Flex,
  Heading,
  Input,
  Stack,
  Switch,
  Text,
  chakra,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { FieldError } from '@/components/ui/feedback';
import { FormSubmitButton } from '@/components/ui/form';
import { useSession } from '@/features/identity';
import { useRouter } from '@/i18n/navigation';
import {
  notificationsControllerArchive,
  notificationsControllerList,
  notificationsControllerPreferences,
  notificationsControllerRead,
  notificationsControllerReadAll,
  notificationsControllerUpdatePreferences,
} from '@/lib/api';
import type {
  NotificationDto,
  NotificationType,
  UpdateNotificationPreferencesDto,
} from '@/lib/api/models';
import { browserPushConfigured, registerBrowserPush } from './browser-push';
import { notificationQueryKey } from './notification-bell';

export function NotificationInbox() {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const locale = useLocale();
  const { user } = useSession();
  const userId = user?.id ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = notificationQueryKey(userId);
  const [page, setPage] = useState(1);
  const [showPreferences, setShowPreferences] = useState(false);
  const [error, setError] = useState(false);
  const items = useQuery({
    queryKey: [...key, 'items', page],
    queryFn: () => notificationsControllerList({ page, limit: 20 }),
    enabled: Boolean(userId),
  });
  const preferences = useQuery({
    queryKey: [...key, 'preferences'],
    queryFn: () => notificationsControllerPreferences(),
    enabled: Boolean(userId) && showPreferences,
  });
  const timezoneForm = useForm({
    values: { timezone: preferences.data?.timezone ?? '' },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const action = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: () => {
      setError(false);
      return refresh();
    },
    onError: () => setError(true),
  });

  // The copy of a notification follows the locale the reader uses in the
  // app, so the language they browse in is the language they are told in.
  const syncedLocale = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    const preference = locale === 'vi' ? 'vi' : 'en';
    if (syncedLocale.current === preference) return;
    syncedLocale.current = preference;
    notificationsControllerUpdatePreferences({ locale: preference }).catch(
      () => {
        // The stored locale only picks the copy of a future notification.
        syncedLocale.current = null;
      },
    );
  }, [locale, userId]);

  function updatePreferences(values: UpdateNotificationPreferencesDto) {
    action.mutate(() => notificationsControllerUpdatePreferences(values));
  }

  function open(notification: NotificationDto) {
    action.mutate(async () => {
      if (!notification.readAt)
        await notificationsControllerRead(notification.id);
      if (
        notification.link.startsWith('/') &&
        !notification.link.startsWith('//') &&
        !notification.link.includes('\\')
      ) {
        router.push(notification.link);
      }
    });
  }

  return (
    <Container as="main" maxW="3xl" py="6">
      <Stack gap="4">
        <Flex justify="space-between" align="center" wrap="wrap" gap="3">
          <Heading as="h1" size="xl">
            {t('title')}
          </Heading>
          <Flex gap="2">
            <Button
              size="sm"
              variant="outline"
              aria-expanded={showPreferences}
              onClick={() => setShowPreferences(!showPreferences)}
            >
              {t('preferences')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate(notificationsControllerReadAll)}
            >
              {t('readAll')}
            </Button>
          </Flex>
        </Flex>
        {error && <FieldError>{t('actionFailed')}</FieldError>}
        {showPreferences && (
          <Box borderWidth="1px" bg="bg.panel" p="4">
            {preferences.isPending ? (
              <Text role="status">{t('loading')}</Text>
            ) : preferences.isError ? (
              <Text role="alert">{t('loadFailed')}</Text>
            ) : (
              <Stack gap="4">
                <Heading as="h2" size="sm">
                  {t('preferences')}
                </Heading>
                <Switch.Root
                  checked={preferences.data.websocketEnabled}
                  disabled={action.isPending}
                  onCheckedChange={({ checked }) =>
                    updatePreferences({ websocketEnabled: checked })
                  }
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Label>{t('live')}</Switch.Label>
                </Switch.Root>
                <Switch.Root
                  checked={preferences.data.pushEnabled}
                  disabled={action.isPending}
                  onCheckedChange={({ checked }) =>
                    updatePreferences({ pushEnabled: checked })
                  }
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Label>{t('push')}</Switch.Label>
                </Switch.Root>
                {browserPushConfigured && (
                  <Button
                    size="sm"
                    alignSelf="start"
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(() => registerBrowserPush(locale))
                    }
                  >
                    {t('registerDevice')}
                  </Button>
                )}
                <form
                  onSubmit={timezoneForm.handleSubmit(({ timezone }) =>
                    updatePreferences({ timezone: timezone.trim() }),
                  )}
                >
                  <Stack gap="1" maxW="sm">
                    <chakra.label htmlFor="notification-timezone">
                      {t('timezone')}
                    </chakra.label>
                    <Flex gap="2">
                      <Input
                        id="notification-timezone"
                        aria-invalid={Boolean(
                          timezoneForm.formState.errors.timezone,
                        )}
                        {...timezoneForm.register('timezone', {
                          validate: (value) => {
                            try {
                              new Intl.DateTimeFormat(undefined, {
                                timeZone: value.trim(),
                              });
                              return true;
                            } catch {
                              return t('timezoneInvalid');
                            }
                          },
                        })}
                      />
                      <FormSubmitButton
                        mutation={action}
                        label={t('save')}
                        disabled={
                          action.isPending || !timezoneForm.formState.isDirty
                        }
                      />
                    </Flex>
                    {timezoneForm.formState.errors.timezone && (
                      <FieldError>{t('timezoneInvalid')}</FieldError>
                    )}
                  </Stack>
                </form>
                <chakra.fieldset disabled={action.isPending}>
                  <Text as="legend" fontWeight="semibold" mb="2">
                    {t('mutedTypes')}
                  </Text>
                  <Stack gap="2">
                    {(Object.keys(t.raw('types')) as NotificationType[]).map(
                      (type) => (
                        <Checkbox.Root
                          key={type}
                          checked={preferences.data.mutedTypes.includes(type)}
                          disabled={action.isPending}
                          onCheckedChange={({ checked }) => {
                            const current = preferences.data.mutedTypes;
                            updatePreferences({
                              mutedTypes:
                                checked === true
                                  ? [...current, type]
                                  : current.filter((item) => item !== type),
                            });
                          }}
                        >
                          <Checkbox.HiddenInput />
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <Checkbox.Label>{t(`types.${type}`)}</Checkbox.Label>
                        </Checkbox.Root>
                      ),
                    )}
                  </Stack>
                </chakra.fieldset>
              </Stack>
            )}
          </Box>
        )}
        {items.isPending ? (
          <Text role="status">{t('loading')}</Text>
        ) : items.isError ? (
          <Text role="alert">{t('loadFailed')}</Text>
        ) : items.data.items.length === 0 ? (
          <Text color="fg.muted">{t('empty')}</Text>
        ) : (
          <Stack gap="0" borderWidth="1px" bg="bg.panel">
            {items.data.items.map((item) => (
              <Flex
                key={item.id}
                gap="3"
                align="center"
                borderBottomWidth="1px"
                bg={item.readAt ? undefined : 'bg.subtle'}
              >
                <Box
                  asChild
                  flex="1"
                  minW="0"
                  textAlign="start"
                  px="4"
                  py="3"
                  layerStyle="interactiveRow"
                >
                  <button
                    type="button"
                    disabled={action.isPending}
                    onClick={() => open(item)}
                  >
                    <Text fontWeight={item.readAt ? 'medium' : 'bold'}>
                      {item.title}
                    </Text>
                    <Text textStyle="sm" color="fg.muted">
                      {item.body}
                    </Text>
                    <Text textStyle="xs" color="fg.muted">
                      {format.dateTime(new Date(item.createdAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </Text>
                  </button>
                </Box>
                <Button
                  mr="3"
                  size="xs"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(async () => {
                      await notificationsControllerArchive(item.id);
                      if (page > 1 && items.data.items.length === 1)
                        setPage(page - 1);
                    })
                  }
                >
                  {t('archive')}
                </Button>
              </Flex>
            ))}
          </Stack>
        )}
        {items.data && (items.data.meta.hasNextPage || page > 1) && (
          <Flex justify="space-between" gap="2">
            <Button
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              {t('previous')}
            </Button>
            <Button
              size="sm"
              disabled={!items.data.meta.hasNextPage}
              onClick={() => setPage(page + 1)}
            >
              {t('next')}
            </Button>
          </Flex>
        )}
      </Stack>
    </Container>
  );
}
