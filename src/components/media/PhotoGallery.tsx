import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Image, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { DatabaseService } from '../../database/DatabaseService';
import { LocalAttachment } from '../../types/mobile';
import { useFocusEffect } from '@react-navigation/native';
import RNFS from 'react-native-fs';

import { useTheme } from '../../context/ThemeContext';

interface PhotoGalleryProps {
  taskId: string;
  componentType?: 'photo' | 'selfie';
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({ taskId, componentType }) => {
  const { theme } = useTheme();
  const [photos, setPhotos] = useState<LocalAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
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
      let query = 'SELECT * FROM attachments WHERE task_id = ?';
      const params = [taskId];
      
      if (componentType) {
        query += ' AND component_type = ?';
        params.push(componentType);
      }
      
      query += ' ORDER BY uploaded_at DESC';
      
      const results = await Promise.race<LocalAttachment[]>([
        DatabaseService.query<LocalAttachment>(query, params),
        new Promise<LocalAttachment[]>((_, reject) =>
          setTimeout(() => reject(new Error('Attachment query timed out')), 4000)
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

  React.useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [loadPhotos])
  );

  const handleDelete = (id: string, localPath: string) => {
    Alert.alert(
      "Delete Photo",
      "Are you sure you want to delete this photo?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              // 1. Delete DB record
              await DatabaseService.execute('DELETE FROM attachments WHERE id = ?', [id]);
              // 2. Delete physical file
              if (await RNFS.exists(localPath)) {
                await RNFS.unlink(localPath);
              }
              // 3. Refresh UI
              loadPhotos();
            } catch {
              Alert.alert('Error', 'Failed to delete photo.');
            }
          }
        }
      ]
    );
  };

  const renderPhotoItem = ({ item }: { item: LocalAttachment }) => (
    <View style={[styles.photoContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Image 
        source={{ uri: `file://${item.localPath}` }} 
        style={styles.thumbnail}
      />
      <View style={[styles.photoMeta, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, item.componentType === 'selfie' ? styles.badgeSelfie : { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.badgeText, { color: theme.colors.surface }]}>{item.componentType.toUpperCase()}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: theme.colors.textMuted }]}>
            <Text style={[styles.badgeText, { color: theme.colors.surface }]}>{item.syncStatus}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.deleteButton} 
        onPress={() => handleDelete(item.id, item.localPath)}
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
      <View style={[styles.emptyContainer, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
        <Icon name="images-outline" size={24} color={theme.colors.textMuted} />
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>No {componentType ? componentType : 'photos'} captured yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={photos}
        keyExtractor={(item) => item.id}
        renderItem={renderPhotoItem}
        contentContainerStyle={styles.listContainer}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  countText: {
    fontSize: 14,
    color: '#6B7280',
  },
  actionRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12, // React Native supports gap
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE', // blue-100
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#1D4ED8', // blue-700
    fontWeight: '500',
    marginLeft: 6,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
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
    width: 140,
    height: 180,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    position: 'relative',
    marginRight: 12,
  },
  thumbnail: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  photoMeta: {
    padding: 8,
    backgroundColor: '#F9FAFB',
    height: 40,
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
    backgroundColor: '#8B5CF6', // violet-500
  },
  badgePhoto: {
    backgroundColor: '#3B82F6', // blue-500
  },
  badgeStatus: {
    backgroundColor: '#4B5563', // gray-600
  },
  badgeText: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.8)', // red-500 with opacity
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
