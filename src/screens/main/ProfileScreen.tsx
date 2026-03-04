import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemePreference } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { DataCleanupManager } from '../../components/profile/DataCleanupManager';
import { DigitalIdCard } from '../../components/profile/DigitalIdCard';

export const ProfileScreen = ({ navigation }: any) => {
  const { user, logout } = useAuth();
  const { theme, themePreference, setThemePreference } = useTheme();

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

  const userProfileInfo = {
    fullName: user?.name || 'Unknown Agent',
    employeeId: user?.employeeId || user?.username || 'N/A',
    department: 'Verification Services',
    designation: user?.role === 'AGENT' ? 'Field Verification Agent' : user?.role,
    email: user?.email,
    validUntil: '31 Dec 2026',
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Profile</Text>

      <DigitalIdCard userProfile={userProfileInfo} />
      
      <View style={[styles.infoContainer, { backgroundColor: theme.colors.surface }]}>
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
          <Text style={[styles.value, { color: theme.colors.text }]}>{user?.email}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>Role</Text>
          <Text style={[styles.value, { color: theme.colors.text }]}>{user?.role}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>App Version</Text>
          <Text style={[styles.value, styles.versionValue, { color: theme.colors.textSecondary }]}>4.0.0 (Build 84)</Text>
        </View>
      </View>

      {renderThemeToggle()}

      <DataCleanupManager />

      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => navigation.navigate('SyncLogs')}>
          <Icon name="bug-outline" size={22} color={theme.colors.textSecondary} />
          <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>Diagnostics & Sync Logs</Text>
          <Icon name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={[styles.logoutButton, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger }]} 
        onPress={logout}>
        <Icon name="log-out-outline" size={22} color={theme.colors.danger} />
        <Text style={[styles.logoutText, { color: theme.colors.danger }]}>Logout</Text>
      </TouchableOpacity>
      
      <View style={styles.spacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    marginTop: 10,
  },
  infoContainer: {
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 32,
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
    marginBottom: 32,
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
    marginBottom: 32,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
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
  spacer: {
    height: 40,
  },
});
