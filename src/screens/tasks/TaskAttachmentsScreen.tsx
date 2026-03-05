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
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import {
  attachmentService,
  RemoteTaskAttachment,
} from '../../services/attachmentService';

export const TaskAttachmentsScreen = ({ route }: any) => {
  const { theme } = useTheme();
  const { taskId, taskNumber } = route.params;
  const [remoteAttachments, setRemoteAttachments] = useState<RemoteTaskAttachment[]>([]);
  const [isRemoteLoading, setIsRemoteLoading] = useState(true);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<RemoteTaskAttachment | null>(null);
  const [previewUri, setPreviewUri] = useState('');
  const [previewMode, setPreviewMode] = useState<'image' | 'text' | 'web' | 'unsupported'>('unsupported');
  const [previewText, setPreviewText] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');

  const loadRemoteAttachments = useCallback(async () => {
    setIsRemoteLoading(true);
    try {
      const attachments = await attachmentService.getRemoteTaskAttachments(taskId);
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

  const resolveAttachmentKind = (attachment: RemoteTaskAttachment): 'image' | 'text' | 'pdf' | 'word' | 'excel' | 'unsupported' => {
    const mime = (attachment.mimeType || '').toLowerCase();
    const filename = (attachment.name || '').toLowerCase();
    const extension = filename.includes('.') ? filename.split('.').pop() || '' : '';

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) {
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

const buildPdfHtml = (base64Data: string): string => `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes" />
  <style>
    body { margin: 0; background: #111827; color: #fff; }
    #container { padding: 8px; }
    canvas { width: 100%; height: auto; margin-bottom: 12px; background: #fff; border-radius: 6px; }
    #status { padding: 12px; font: 14px sans-serif; }
  </style>
</head>
<body>
  <div id="status">Loading PDF...</div>
  <div id="container"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
  <script>
    (async function () {
      const b64 = '${base64Data}';
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

      const container = document.getElementById('container');
      const status = document.getElementById('status');
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      status.textContent = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        container.appendChild(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    })().catch(function (err) {
      document.getElementById('status').textContent = 'Failed to render PDF: ' + String(err);
    });
  </script>
</body>
</html>
`;

const buildWordHtml = (base64Data: string): string => `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes" />
  <style>
    body { margin: 0; padding: 16px; font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; color: #111827; background: #F8FAFC; }
    #status { color: #64748B; }
    #content { background: #fff; border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  </style>
</head>
<body>
  <div id="status">Loading Word document...</div>
  <div id="content"></div>
  <script src="https://unpkg.com/mammoth/mammoth.browser.min.js"></script>
  <script>
    (async function () {
      const b64 = '${base64Data}';
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
      document.getElementById('content').innerHTML = result.value || '<p>No content</p>';
      document.getElementById('status').textContent = '';
    })().catch(function (err) {
      document.getElementById('status').textContent = 'Failed to render Word document: ' + String(err);
    });
  </script>
</body>
</html>
`;

const buildExcelHtml = (base64Data: string): string => `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes" />
  <style>
    body { margin: 0; padding: 12px; background: #F8FAFC; font: 13px -apple-system, BlinkMacSystemFont, sans-serif; }
    #status { color: #64748B; padding: 6px 0 12px 0; }
    #tableWrap { overflow: auto; background: #fff; border-radius: 8px; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    table { border-collapse: collapse; width: max-content; min-width: 100%; }
    td, th { border: 1px solid #E2E8F0; padding: 6px 8px; white-space: nowrap; }
    th { background: #EEF2FF; position: sticky; top: 0; }
  </style>
</head>
<body>
  <div id="status">Loading Excel sheet...</div>
  <div id="tableWrap"></div>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script>
    (function () {
      try {
        const b64 = '${base64Data}';
        const workbook = XLSX.read(b64, { type: 'base64' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
        document.getElementById('tableWrap').innerHTML = html;
        document.getElementById('status').textContent = 'Sheet: ' + sheetName;
      } catch (err) {
        document.getElementById('status').textContent = 'Failed to render Excel: ' + String(err);
      }
    })();
  </script>
</body>
</html>
`;

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

      setPreviewAttachment(attachment);
      setPreviewUri(normalizedUri);
      setPreviewText('');
      setPreviewHtml('');
      setPreviewMode('unsupported');

      if (kind === 'image') {
        setPreviewMode('image');
        return;
      }

      if (kind === 'text') {
        const textData = await RNFS.readFile(filePath, 'utf8');
        setPreviewText(textData);
        setPreviewMode('text');
        return;
      }

      if (kind === 'pdf' || kind === 'word' || kind === 'excel') {
        const base64Data = await RNFS.readFile(filePath, 'base64');
        if (kind === 'pdf') {
          setPreviewHtml(buildPdfHtml(base64Data));
        } else if (kind === 'word') {
          setPreviewHtml(buildWordHtml(base64Data));
        } else {
          setPreviewHtml(buildExcelHtml(base64Data));
        }
        setPreviewMode('web');
        return;
      }

      setPreviewMode('unsupported');
    } catch (error: any) {
      Alert.alert(
        'Attachment Error',
        error?.message || 'Failed to open attachment.',
      );
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const watermarkText = taskNumber
    ? `CONFIDENTIAL • CaseFlow Mobile • ${taskNumber}`
    : 'CONFIDENTIAL • CaseFlow Mobile';
  const watermarkRowCount = previewMode === 'web' || previewMode === 'text' ? 6 : 8;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.headerCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Task Attachments</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>VT ID: {taskNumber || 'N/A'}</Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>Shared Attachments</Text>
          {isRemoteLoading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : remoteAttachments.length === 0 ? (
            <View style={[styles.emptyWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
              <Icon name="attach-outline" size={22} color={theme.colors.textMuted} />
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                No shared attachments found for this task.
              </Text>
            </View>
          ) : (
            remoteAttachments.map(attachment => (
              <TouchableOpacity
                key={attachment.id}
                style={[styles.attachmentRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                onPress={() => handleOpenAttachment(attachment)}
                activeOpacity={0.75}>
                <View style={styles.attachmentIconWrap}>
                  <Icon
                    name={attachment.type === 'image' ? 'image-outline' : 'document-text-outline'}
                    size={22}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.attachmentMeta}>
                  <Text numberOfLines={1} style={[styles.attachmentName, { color: theme.colors.text }]}>
                    {attachment.name}
                  </Text>
                  <Text style={[styles.attachmentInfo, { color: theme.colors.textMuted }]}>
                    {formatFileSize(attachment.size)} • {new Date(attachment.uploadedAt).toLocaleString()}
                  </Text>
                </View>
                {openingAttachmentId === attachment.id ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon name="open-outline" size={20} color={theme.colors.textSecondary} />
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
        }}>
        <View style={styles.previewOverlay}>
          <View style={[styles.previewCard, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.previewHeader, { borderBottomColor: theme.colors.border }]}>
              <Text numberOfLines={1} style={[styles.previewTitle, { color: theme.colors.text }]}>
                {previewAttachment?.name || 'Attachment'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setPreviewAttachment(null);
                  setPreviewUri('');
                  setPreviewHtml('');
                  setPreviewText('');
                  setPreviewMode('unsupported');
                }}>
                <Icon name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewBodyContainer}>
              {previewMode === 'image' && previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
              ) : previewMode === 'text' ? (
                <ScrollView style={styles.previewTextWrap} contentContainerStyle={styles.previewTextContent}>
                  <Text style={[styles.previewText, { color: theme.colors.text }]}>
                    {previewText || 'No text content available.'}
                  </Text>
                </ScrollView>
              ) : previewMode === 'web' && previewHtml ? (
                <WebView
                  originWhitelist={['*']}
                  source={{ html: previewHtml }}
                  style={styles.previewWebView}
                  javaScriptEnabled
                  domStorageEnabled
                  setSupportMultipleWindows={false}
                  setBuiltInZoomControls={Platform.OS === 'android'}
                  setDisplayZoomControls={false}
                />
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Icon name="document-text-outline" size={44} color={theme.colors.textMuted} />
                  <Text style={[styles.previewPlaceholderText, { color: theme.colors.textSecondary }]}>
                    Preview unavailable for this file type.
                  </Text>
                  <Text style={[styles.previewPlaceholderSubText, { color: theme.colors.textMuted }]}>
                    Upload as image if in-app preview is required.
                  </Text>
                </View>
              )}

              <View pointerEvents="none" style={styles.watermarkOverlay}>
                {Array.from({ length: watermarkRowCount }).map((_, index) => (
                  <Text key={`${index}-${watermarkText}`} style={styles.watermarkText}>
                    {watermarkText}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  previewWebView: {
    width: '100%',
    height: 520,
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
