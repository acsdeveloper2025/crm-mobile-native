// normalizeVerificationType - Maps backend verificationType strings
// to the short formType keys used by the mobile API endpoints.
// Mirrors CRM-BACKEND/src/controllers/mobileFormController.ts normalizeVerificationType()

/**
 * Normalize a backend verificationType string (e.g. "Business Verification")
 * into the short kebab-case form type key used by the API endpoint map
 * (e.g. "business").
 *
 * The backend routes expect:
 *   /verification-tasks/:taskId/verification/<formTypeKey>
 *
 * where formTypeKey ∈ {
 *   residence, office, business, builder, noc,
 *   residence-cum-office, dsa-connector,
 *   property-individual, property-apf
 * }
 */
export function normalizeVerificationType(verificationType: string): string {
  const upper = verificationType.toUpperCase();

  // Combined type must be checked first
  if (upper.includes('RESIDENCE') && upper.includes('OFFICE')) {
    return 'residence-cum-office';
  }

  if (upper.includes('RESIDENCE')) return 'residence';
  if (upper.includes('OFFICE')) return 'office';
  if (upper.includes('BUSINESS')) return 'business';
  if (upper.includes('BUILDER')) return 'builder';
  if (upper.includes('NOC')) return 'noc';
  if (upper.includes('DSA') || upper.includes('CONNECTOR')) return 'dsa-connector';
  if (upper.includes('PROPERTY') && upper.includes('APF')) return 'property-apf';
  if (upper.includes('PROPERTY') && upper.includes('INDIVIDUAL')) return 'property-individual';

  // Fallback: try direct lowercase-kebab conversion
  return verificationType.toLowerCase().replace(/[_\s]+/g, '-');
}
