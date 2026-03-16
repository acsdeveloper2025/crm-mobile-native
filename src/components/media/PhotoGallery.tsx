import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import { useFocusEffect } from '@react-navigation/native';
import type { LocalAttachment } from '../../types/mobile';
import { useTheme } from '../../context/ThemeContext';
import { AttachmentRepository } from '../../repositories/AttachmentRepository';

interface PhotoGalleryProps {
  taskId: string;
  componentType?: 'photo' | 'selfie';
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({ taskId, componentType }) => {
  const { theme } = useTheme();
  const [photos, setPhotos] = useState<LocalAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<LocalAttachment | null>(null);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadPhotos = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      setIsLoading(true);

      const results = await Promise.race<LocalAttachment[]>([
        AttachmentRepository.listForTask(taskId, componentType),
        new Promise<LocalAttachment[]>((_, reject) =>
          setTimeout(() => reject(new Error('Attachment query timed out')), 3000),
        ),
      ]);

      if (isMountedRef.current && requestId === requestIdRef.current) {
        setPhotos(results || []);
      }
    } catch (err) {
      console.error('Failed to load photos:', err);
    } finally {
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setHasLoadedOnce(true);
        setIsLoading(false);
      }
    }
  }, [taskId, componentType]);

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [loadPhotos]),
  );

  const handleDelete = (id: string, _localPath: string, _thumbnailPath?: string) => {
    Alert.alert('Delete Photo', 'Are you sure you want to delete this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await AttachmentRepository.deleteLocalFilesById(id);
            await AttachmentRepository.deleteById(id);
            loadPhotos();
          } catch {
            Alert.alert('Error', 'Failed to delete photo.');
          }
        },
      },
    ]);
  };

  const openPreview = async (item: LocalAttachment) => {
    const exists = await RNFS.exists(item.localPath);
    if (!exists) {
      Alert.alert('Unavailable', 'Image file not found on device.');
      return;
    }
    setSelectedPhoto(item);
  };

  const renderPhotoItem = ({ item }: { item: LocalAttachment }) => (
    <View
      style={[
        styles.photoContainer,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => openPreview(item)} style={styles.thumbnailPress}>
        <Image
          source={{ uri: `file://${item.thumbnailPath || item.localPath}` }}
          style={styles.thumbnail}
          resizeMethod="resize"
        />
        <View style={styles.previewHint}>
          <Icon name="expand-outline" size={14} color="#ffffff" />
        </View>
      </TouchableOpacity>

      <View style={[styles.photoMeta, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              item.componentType === 'selfie'
                ? styles.badgeSelfie
                : { backgroundColor: theme.colors.primary },
            ]}>
            <Text style={[styles.badgeText, { color: theme.colors.surface }]}>
              {item.componentType.toUpperCase()}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: theme.colors.textMuted }]}>
            <Text style={[styles.badgeText, { color: theme.colors.surface }]}>
              {item.syncStatus}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id, item.localPath, item.thumbnailPath)}
        disabled={item.syncStatus === 'UPLOADING' || item.syncStatus === 'SYNCED'}>
        <Icon name="trash" size={18} color="white" />
      </TouchableOpacity>
    </View>
  );

  if (isLoading && !hasLoadedOnce) {
    return (
      <View style={styles.loadingWrapper}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
        ]}>
        <Icon name="images-outline" size={24} color={theme.colors.textMuted} />
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
          No {componentType || 'photos'} captured yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={photos}
        keyExtractor={item => item.id}
        renderItem={renderPhotoItem}
        contentContainerStyle={styles.listContainer}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={5}
      />

      <Modal
        visible={Boolean(selectedPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}>
        <View style={styles.previewOverlay}>
          <View style={[styles.previewHeader, { borderBottomColor: theme.colors.border }]}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {selectedPhoto?.filename || 'Preview'}
            </Text>
            <TouchableOpacity onPress={() => setSelectedPhoto(null)} style={styles.previewClose}>
              <Icon name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewBody}>
            {selectedPhoto ? (
              <Image
                source={{ uri: `file://${selectedPhoto.localPath}` }}
                style={styles.previewImage}
                resizeMode="contain"
                resizeMethod="resize"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  listContainer: {
    paddingRight: 16,
  },
  loadingWrapper: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoContainer: {
    width: 142,
    height: 184,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
    marginRight: 12,
  },
  thumbnailPress: {
    width: '100%',
    height: 140,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewHint: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMeta: {
    padding: 8,
    height: 44,
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  badgeSelfie: {
    backgroundColor: '#0ea5e9',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '700',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  previewHeader: {
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  previewClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
