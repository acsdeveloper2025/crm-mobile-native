import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemePreference } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { DataCleanupManager } from '../../components/profile/DataCleanupManager';

export const ProfileScreen = ({ navigation }: any) => {
  const { user, logout } = useAuth();
  const { theme, themePreference, setThemePreference } = useTheme();
  const [showCleanupManager, setShowCleanupManager] = useState(false);
  const insets = useSafeAreaInsets();

  const renderThemeToggle = () => {
    const preferences: { id: ThemePreference; label: string; icon: string }[] = [
      { id: 'light', label: 'Light', icon: 'sunny-outline' },
      { id: 'dark', label: 'Dark', icon: 'moon-outline' },
      { id: 'system', label: 'System', icon: 'settings-outline' },
    ];

    return (
      <View style={styles.themeContainer}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>App Theme</Text>
        <View style={[styles.toggleWrapper, { backgroundColor: theme.colors.surfaceAlt }]}>
          {preferences.map((pref) => (
            <TouchableOpacity
              key={pref.id}
              onPress={() => setThemePreference(pref.id)}
              style={[
                styles.toggleItem,
                themePreference === pref.id && [styles.activeToggle, { backgroundColor: theme.colors.primary }]
              ]}>
              <Icon 
                name={pref.icon} 
                size={20} 
                color={themePreference === pref.id ? theme.colors.surface : theme.colors.textSecondary} 
              />
              <Text 
                style={[
                  styles.toggleLabel, 
                  { color: themePreference === pref.id ? theme.colors.surface : theme.colors.textSecondary }
                ]}>
                {pref.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Profile</Text>

        <View style={styles.avatarSection}>
          <View style={[styles.avatarContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {user?.profilePhotoUrl ? (
              <Image source={{ uri: user.profilePhotoUrl }} style={styles.avatarImage} />
            ) : (
              <Icon name="person" size={44} color={theme.colors.textSecondary} />
            )}
          </View>
          <Text style={[styles.avatarName, { color: theme.colors.text }]}>{user?.name || 'Agent'}</Text>
          <Text style={[styles.avatarSubtext, { color: theme.colors.textSecondary }]}>
            Agent ID: {user?.employeeId || user?.username || 'N/A'}
          </Text>
        </View>
      
        <View style={[styles.infoContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Name</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{user?.name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Agent ID</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{user?.employeeId || user?.username}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Email</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{user?.email || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Role</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{user?.role || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>App Version</Text>
            <Text style={[styles.value, styles.versionValue, { color: theme.colors.textSecondary }]}>4.0.0 (Build 84)</Text>
          </View>
        </View>

        {renderThemeToggle()}

        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={() => navigation.navigate('DigitalIdCard')}>
            <Icon name="card-outline" size={22} color={theme.colors.textSecondary} />
            <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>View Digital ID Card</Text>
            <Icon name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={() => navigation.navigate('SyncLogs')}>
            <Icon name="bug-outline" size={22} color={theme.colors.textSecondary} />
            <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>Diagnostics & Sync Logs</Text>
            <Icon name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={() => setShowCleanupManager(prev => !prev)}>
            <Icon name="trash-outline" size={22} color={theme.colors.textSecondary} />
            <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>
              {showCleanupManager ? 'Hide Data Cleanup' : 'Data Cleanup Manager'}
            </Text>
            <Icon name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        {showCleanupManager && <DataCleanupManager />}

        <TouchableOpacity 
          style={[styles.logoutButton, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger }]} 
          onPress={logout}>
          <Icon name="log-out-outline" size={22} color={theme.colors.danger} />
          <Text style={[styles.logoutText, { color: theme.colors.danger }]}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 18,
    marginTop: 4,
  },
  infoContainer: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatarContainer: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarName: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
  },
  avatarSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  detailRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '600',
  },
  value: {
    fontSize: 18,
    fontWeight: '500',
  },
  versionValue: {
    fontSize: 14,
  },
  themeContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  toggleWrapper: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  toggleItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeToggle: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  toggleLabel: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  actionsContainer: {
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  actionText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  logoutText: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
