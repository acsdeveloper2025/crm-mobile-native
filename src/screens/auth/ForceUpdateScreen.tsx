import { View, Text, StyleSheet, TouchableOpacity, Linking, SafeAreaView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { Logger } from '../../utils/logger';

export const ForceUpdateScreen = ({ route }: { route: Record<string, unknown> }) => {
  const { theme } = useTheme();
  const { downloadUrl, releaseNotes } = route.params || {};

  const handleUpdate = () => {
    if (downloadUrl) {
      Linking.openURL(downloadUrl).catch(err =>
        Logger.error('ForceUpdateScreen', "Couldn't load page", err),
      );
    } else {
      // Fallback if URL is missing for some reason
      Logger.warn('ForceUpdateScreen', 'Update URL not provided.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.danger + '10' }]}>
          <Icon name="alert-circle" size={80} color={theme.colors.danger} />
        </View>
        
        <Text style={[styles.title, { color: theme.colors.text }]}>Update Required</Text>
        
        <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
          A new version of the CRM App is available. This update includes critical data schema updates and must be installed to continue working.
        </Text>
 
        {releaseNotes ? (
          <View style={[styles.releaseNotesContainer, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <Text style={[styles.releaseNotesSubtitle, { color: theme.colors.textSecondary }]}>What's New:</Text>
            <Text style={[styles.releaseNotesText, { color: theme.colors.text }]}>{releaseNotes}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity 
          style={[styles.updateButton, { backgroundColor: theme.colors.primary }]} 
          onPress={handleUpdate}>
          <Icon name="cloud-download-outline" size={20} color={theme.colors.surface} />
          <Text style={[styles.updateButtonText, { color: theme.colors.surface }]}>Download Update</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    marginBottom: 32,
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  releaseNotesContainer: {
    padding: 20,
    borderRadius: 16,
    width: '100%',
    borderWidth: 1,
  },
  releaseNotesSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  releaseNotesText: {
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    padding: 24,
    paddingBottom: 48,
    borderTopWidth: 1,
  },
  updateButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  updateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  }
});
