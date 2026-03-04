export interface VerificationFormData {
  [key: string]: any;
}

export interface VerificationSubmissionRequest {
  verificationTaskId?: string;
  formData?: VerificationFormData;
  attachmentIds?: string[];
  geoLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: string;
  };
  photos?: Array<{
    attachmentId?: string;
    geoLocation?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      timestamp?: string;
    };
  }>;
  images?: Array<{
    dataUrl: string;
    type: 'verification' | 'selfie';
  }>;
}

const noopAsync = async () => ({ success: true });

const VerificationFormService: any = new Proxy(
  {
    submitForm: noopAsync,
    saveDraft: noopAsync,
    loadDraft: async () => null,
    clearDraft: async () => {},
    validateForm: () => ({ isValid: true, errors: [] }),
  },
  {
    get(target, prop) {
      if (prop in target) {
        return (target as any)[prop];
      }
      return noopAsync;
    },
  },
);

export default VerificationFormService;
