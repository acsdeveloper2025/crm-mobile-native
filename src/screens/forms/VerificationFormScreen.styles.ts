import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create(
{
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  centerLoadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  outcomeWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  stateHintText: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
  },
  outcomeWarningCard: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  outcomeWarningText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  outcomeBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  outcomeBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  outcomeText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    flexShrink: 1,
  },
  activeOutcomeText: {
    fontWeight: 'bold',
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  selfieHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 24,
  },
  photoLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
  },
  stateCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stateCardText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 1,
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spacer: {
    height: 100,
  }
});
