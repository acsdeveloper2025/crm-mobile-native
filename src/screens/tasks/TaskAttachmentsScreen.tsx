import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Linking,
} from 'react-native';
import RNFS from 'react-native-fs';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  attachmentService,
  RemoteTaskAttachment,
} from '../../services/AttachmentService';

export const TaskAttachmentsScreen = ({ route }: any) => {
  const { theme } = useTheme();
  const { taskId, taskNumber } = route.params || {};
  const [remoteAttachments, setRemoteAttachments] = useState<
    RemoteTaskAttachment[]
  >([]);
  const [isRemoteLoading, setIsRemoteLoading] = useState(true);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(
    null,
  );
  const [previewAttachment, setPreviewAttachment] =
    useState<RemoteTaskAttachment | null>(null);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMode, setPreviewMode] = useState<
    'image' | 'text' | 'unsupported'
  >('unsupported');
  const [previewText, setPreviewText] = useState('');

  const loadRemoteAttachments = useCallback(async () => {
    setIsRemoteLoading(true);
    try {
      const attachments = await attachmentService.getRemoteTaskAttachments(
        taskId,
      );
      setRemoteAttachments(attachments);
    } finally {
      setIsRemoteLoading(false);
    }
  }, [taskId]);

  useFocusEffect(
    useCallback(() => {
      loadRemoteAttachments();
    }, [loadRemoteAttachments]),
  );

  const formatFileSize = (size: number) => {
    if (!size) {
      return '0 B';
    }
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const resolveAttachmentKind = (
    attachment: RemoteTaskAttachment,
  ): 'image' | 'text' | 'pdf' | 'word' | 'excel' | 'unsupported' => {
    const mime = (attachment.mimeType || '').toLowerCase();
    const filename = (attachment.name || '').toLowerCase();
    const extension = filename.includes('.')
      ? filename.split('.').pop() || ''
      : '';

    if (
      mime.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)
    ) {
      return 'image';
    }
    if (mime === 'application/pdf' || extension === 'pdf') {
      return 'pdf';
    }
    if (
      mime.includes('word') ||
      mime.includes('officedocument.wordprocessingml') ||
      extension === 'doc' ||
      extension === 'docx'
    ) {
      return 'word';
    }
    if (
      mime.includes('spreadsheet') ||
      mime.includes('excel') ||
      extension === 'xls' ||
      extension === 'xlsx'
    ) {
      return 'excel';
    }
    if (
      mime.startsWith('text/') ||
      ['txt', 'csv', 'json', 'xml', 'log', 'md'].includes(extension)
    ) {
      return 'text';
    }
    return 'unsupported';
  };

  const openWithNativeViewer = useCallback(
    async (uri: string, attachment: RemoteTaskAttachment) => {
      const canOpen = await Linking.canOpenURL(uri);
      if (!canOpen) {
        Alert.alert(
          'Preview Unavailable',
          `${attachment.name} cannot be previewed inside the app. No compatible viewer was found on this device.`,
        );
        return;
      }

      await Linking.openURL(uri);
    },
    [],
  );

  const handleOpenAttachment = async (attachment: RemoteTaskAttachment) => {
    try {
      setOpeningAttachmentId(attachment.id);
      const uri = await attachmentService.getAttachmentContent(attachment);
      if (!uri) {
        Alert.alert('Attachment Error', 'Unable to open this attachment.');
        return;
      }

      const normalizedUri = uri.startsWith('file://') ? uri : `file://${uri}`;
      const filePath = normalizedUri.replace(/^file:\/\//, '');
      const kind = resolveAttachmentKind(attachment);

      setPreviewText('');
      setPreviewMode('unsupported');

      if (kind === 'image') {
        setPreviewAttachment(attachment);
        setPreviewUri(normalizedUri);
        setPreviewMode('image');
        return;
      }

      if (kind === 'text') {
        // Limit text preview to 500KB to prevent UI freeze on large files
        const stat = await RNFS.stat(filePath);
        const fileSize =
          typeof stat.size === 'number'
            ? stat.size
            : parseInt(String(stat.size), 10);
        if (fileSize > 512 * 1024) {
          Alert.alert(
            'File Too Large',
            'This text file is too large to preview. Opening with system viewer instead.',
          );
          await openWithNativeViewer(normalizedUri, attachment);
          return;
        }
        const textData = await RNFS.readFile(filePath, 'utf8');
        setPreviewAttachment(attachment);
        setPreviewUri(normalizedUri);
        setPreviewText(textData);
        setPreviewMode('text');
        return;
      }

      if (kind === 'pdf' || kind === 'word' || kind === 'excel') {
        await openWithNativeViewer(normalizedUri, attachment);
        return;
      }

      setPreviewAttachment(attachment);
      setPreviewUri(normalizedUri);
      setPreviewMode('unsupported');
    } catch (error: unknown) {
      Alert.alert(
        'Attachment Error',
        error instanceof Error
          ? error.message
          : String(error) || 'Failed to open attachment.',
      );
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const watermarkText = taskNumber
    ? `CONFIDENTIAL • CaseFlow Mobile • ${taskNumber}`
    : 'CONFIDENTIAL • CaseFlow Mobile';
  const watermarkRowCount = previewMode === 'text' ? 6 : 8;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScreenHeader title="Attachments" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.headerCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Task Attachments
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            VT ID: {taskNumber || 'N/A'}
          </Text>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
          >
            Shared Attachments
          </Text>
          {isRemoteLoading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : remoteAttachments.length === 0 ? (
            <View
              style={[
                styles.emptyWrap,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                },
              ]}
            >
              <Icon
                name="attach-outline"
                size={22}
                color={theme.colors.textMuted}
              />
              <Text
                style={[styles.emptyText, { color: theme.colors.textMuted }]}
              >
                No shared attachments found for this task.
              </Text>
            </View>
          ) : (
            remoteAttachments.map(attachment => (
              <TouchableOpacity
                key={attachment.id}
                style={[
                  styles.attachmentRow,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                  },
                ]}
                onPress={() => handleOpenAttachment(attachment)}
                activeOpacity={0.75}
              >
                <View style={styles.attachmentIconWrap}>
                  <Icon
                    name={
                      attachment.type === 'image'
                        ? 'image-outline'
                        : 'document-text-outline'
                    }
                    size={22}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.attachmentMeta}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.attachmentName,
                      { color: theme.colors.text },
                    ]}
                  >
                    {attachment.name}
                  </Text>
                  <Text
                    style={[
                      styles.attachmentInfo,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {formatFileSize(attachment.size)} •{' '}
                    {new Date(attachment.uploadedAt).toLocaleString()}
                  </Text>
                </View>
                {openingAttachmentId === attachment.id ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                ) : (
                  <Icon
                    name="open-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(previewAttachment)}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setPreviewAttachment(null);
          setPreviewUri('');
        }}
      >
        <View style={styles.previewOverlay}>
          <View
            style={[
              styles.previewCard,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View
              style={[
                styles.previewHeader,
                { borderBottomColor: theme.colors.border },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.previewTitle, { color: theme.colors.text }]}
              >
                {previewAttachment?.name || 'Attachment'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setPreviewAttachment(null);
                  setPreviewUri('');
                  setPreviewText('');
                  setPreviewMode('unsupported');
                }}
              >
                <Icon name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewBodyContainer}>
              {previewMode === 'image' && previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              ) : previewMode === 'text' ? (
                <ScrollView
                  style={styles.previewTextWrap}
                  contentContainerStyle={styles.previewTextContent}
                >
                  <Text
                    style={[styles.previewText, { color: theme.colors.text }]}
                  >
                    {previewText || 'No text content available.'}
                  </Text>
                </ScrollView>
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Icon
                    name="document-text-outline"
                    size={44}
                    color={theme.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.previewPlaceholderText,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Preview unavailable for this file type.
                  </Text>
                  <Text
                    style={[
                      styles.previewPlaceholderSubText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Upload as image if in-app preview is required.
                  </Text>
                </View>
              )}

              <View pointerEvents="none" style={styles.watermarkOverlay}>
                {Array.from({ length: watermarkRowCount }).map((_, index) => (
                  <Text
                    key={`${index}-${watermarkText}`}
                    style={styles.watermarkText}
                  >
                    {watermarkText}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  loaderWrap: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  attachmentRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentIconWrap: {
    marginRight: 10,
  },
  attachmentMeta: {
    flex: 1,
    marginRight: 8,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: '700',
  },
  attachmentInfo: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '500',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 14,
  },
  previewCard: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    maxHeight: '86%',
  },
  previewHeader: {
    height: 52,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: {
    flex: 1,
    marginRight: 10,
    fontSize: 14,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    height: 460,
    backgroundColor: '#000',
  },
  previewBodyContainer: {
    position: 'relative',
    minHeight: 420,
  },
  previewTextWrap: {
    maxHeight: 520,
  },
  previewTextContent: {
    padding: 14,
  },
  previewText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  previewPlaceholder: {
    paddingVertical: 34,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewPlaceholderSubText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  watermarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ rotate: '-22deg' }],
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  watermarkText: {
    color: 'rgba(32,32,32,0.10)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
