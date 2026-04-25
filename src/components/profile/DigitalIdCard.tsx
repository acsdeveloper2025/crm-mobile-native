import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { PreserveCase } from '../ui/PreserveCase';

interface UserProfile {
  fullName: string;
  employeeId: string;
  profilePhoto?: string;
  designation?: string;
  department?: string;
  validUntil?: string;
  phoneNumber?: string;
  email?: string;
}

interface DigitalIdCardProps {
  userProfile: UserProfile;
  companyName?: string;
  companyAddress?: string;
}

const { width: screenWidth } = Dimensions.get('window');
const cardWidth = screenWidth * 0.9;

export const DigitalIdCard: React.FC<DigitalIdCardProps> = ({
  userProfile,
  companyName = 'All Check Services LLP',
  companyAddress = 'Office No. 406, 4th Floor, Neptune Flying Colors, Din Dayal Upadhyay Rd, Mumbai, Maharashtra 400080',
}) => {
  const { theme } = useTheme();

  return (
    <View style={styles.cardContainer}>
      <View
        style={[
          styles.card,
          { width: cardWidth, backgroundColor: theme.colors.surface },
        ]}
      >
        {/* Header Section with Company Branding */}
        <View
          style={[styles.header, { backgroundColor: theme.colors.primary }]}
        >
          <View style={styles.headerContent}>
            <View
              style={[
                styles.companyLogoPlaceholder,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Icon name="business" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text
                numberOfLines={2}
                ellipsizeMode="tail"
                style={styles.companyNameText}
              >
                {companyName}
              </Text>
              <Text style={styles.idCardTitle}>EMPLOYEE IDENTITY CARD</Text>
            </View>
          </View>
        </View>

        {/* Main Content Section */}
        <View style={styles.mainContent}>
          {/* User Photo Section */}
          <View style={styles.photoSection}>
            <View style={styles.photoContainer}>
              {userProfile.profilePhoto ? (
                <Image
                  source={{ uri: userProfile.profilePhoto }}
                  style={[
                    styles.profilePhoto,
                    { borderColor: theme.colors.primary },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.placeholderPhoto,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.placeholderText,
                      { color: theme.colors.text },
                    ]}
                  >
                    {userProfile.fullName
                      ? userProfile.fullName
                          .split(' ')
                          .map(n => n?.[0])
                          .join('')
                          .substring(0, 2)
                          .toUpperCase()
                      : '?'}
                  </Text>
                </View>
              )}
            </View>
            <Text
              numberOfLines={3}
              ellipsizeMode="tail"
              style={[styles.userName, { color: theme.colors.text }]}
            >
              {userProfile.fullName.toUpperCase()}
            </Text>
          </View>

          {/* User Details Section */}
          <View style={styles.detailsSection}>
            <View style={styles.detailsContainer}>
              <View style={styles.detailRow}>
                <Text
                  style={[
                    styles.detailLabel,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Employee ID:
                </Text>
                <PreserveCase
                  style={[styles.detailValue, { color: theme.colors.text }]}
                >
                  {userProfile.employeeId}
                </PreserveCase>
              </View>

              {userProfile.designation && (
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.detailLabel,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Designation:
                  </Text>
                  <Text
                    style={[styles.detailValue, { color: theme.colors.text }]}
                  >
                    {userProfile.designation}
                  </Text>
                </View>
              )}

              {userProfile.department && (
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.detailLabel,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Department:
                  </Text>
                  <Text
                    style={[styles.detailValue, { color: theme.colors.text }]}
                  >
                    {userProfile.department}
                  </Text>
                </View>
              )}

              {userProfile.phoneNumber && (
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.detailLabel,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Phone:
                  </Text>
                  <Text
                    style={[styles.detailValue, { color: theme.colors.text }]}
                  >
                    {userProfile.phoneNumber}
                  </Text>
                </View>
              )}

              {userProfile.email && (
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.detailLabel,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Email:
                  </Text>
                  <PreserveCase
                    style={[styles.detailValue, { color: theme.colors.text }]}
                  >
                    {userProfile.email}
                  </PreserveCase>
                </View>
              )}

              {userProfile.validUntil && (
                <View style={styles.detailRow}>
                  <Text
                    style={[
                      styles.detailLabel,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Valid Until:
                  </Text>
                  <Text
                    style={[styles.detailValue, { color: theme.colors.text }]}
                  >
                    {userProfile.validUntil}
                  </Text>
                </View>
              )}
            </View>

            {/* Company Stamp Section (Placeholder icon) */}
            <View style={styles.stampSection}>
              <Icon
                name="checkmark-circle"
                size={40}
                color={theme.colors.success + '80'}
              />
              <Text
                style={[styles.stampText, { color: theme.colors.textMuted }]}
              >
                VERIFIED
              </Text>
            </View>
          </View>
        </View>

        {/* Company Address Footer */}
        <View
          style={[
            styles.addressSection,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <Text
            numberOfLines={3}
            ellipsizeMode="tail"
            style={[styles.addressText, { color: theme.colors.textSecondary }]}
          >
            {companyAddress}
          </Text>
          <Text
            style={[styles.disclaimerText, { color: theme.colors.textMuted }]}
          >
            If found, please return to the address above.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  companyLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  companyNameText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  idCardTitle: {
    color: '#E0E0E0',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  mainContent: {
    flexDirection: 'row',
    padding: 16,
    minHeight: 140,
  },
  photoSection: {
    width: '35%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  photoContainer: {
    marginBottom: 10,
  },
  profilePhoto: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
  },
  placeholderPhoto: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  placeholderText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  detailsSection: {
    flex: 1,
    paddingLeft: 16,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  detailsContainer: {
    flex: 1,
  },
  detailRow: {
    marginBottom: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '600',
    width: '40%',
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '500',
    width: '60%',
  },
  stampSection: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingRight: 8,
  },
  stampText: {
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  addressSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  addressText: {
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 12,
    fontWeight: '500',
  },
  disclaimerText: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
