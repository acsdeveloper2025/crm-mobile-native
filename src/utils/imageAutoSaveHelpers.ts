import { CapturedImage } from '../types/index';

/**
 * Helper functions for image auto-save functionality
 * These functions ensure proper auto-save integration for all verification forms
 */

/**
 * Creates image change handler that triggers auto-save for regular photos
 * @param updateReport - Function to update the report in context
 * @param taskId - Task ID
 * @param report - Current report data
 * @param handleAutoSaveImagesChange - Auto-save callback from AutoSaveFormWrapper
 * @returns Image change handler function
 */
export const createImageChangeHandler = (
  updateReport: (taskId: string, updates: any) => void,
  taskId: string,
  report: any,
  handleAutoSaveImagesChange: (images: CapturedImage[]) => void
) => {
  return (images: CapturedImage[]) => {
    // Add metadata to identify these as regular images
    const imagesWithMetadata = images.map(img => ({
      ...img,
      componentType: 'photo' as const
    }));

    console.log(`📸 Regular images changed: ${imagesWithMetadata.length} photos for task ${taskId}`);

    // Only update the image field. The task context merge logic will combine
    // this with the latest in-memory report and avoids wiping other fields
    // (especially selfie images) from a stale render closure.
    updateReport(taskId, { images: imagesWithMetadata });

    // Trigger auto-save with all images (regular + selfie)
    const allImages = [
      ...imagesWithMetadata,
      ...(report.selfieImages || []).map((img: CapturedImage) => ({ ...img, componentType: 'selfie' as const }))
    ];

    console.log(`💾 Triggering auto-save with ${allImages.length} total images (${imagesWithMetadata.length} photos + ${report.selfieImages?.length || 0} selfies)`);
    handleAutoSaveImagesChange(allImages);
  };
};

/**
 * Creates selfie image change handler that triggers auto-save for selfie photos
 * @param updateReport - Function to update the report in context
 * @param taskId - Task ID
 * @param report - Current report data
 * @param handleAutoSaveImagesChange - Auto-save callback from AutoSaveFormWrapper
 * @returns Selfie image change handler function
 */
export const createSelfieImageChangeHandler = (
  updateReport: (taskId: string, updates: any) => void,
  taskId: string,
  report: any,
  handleAutoSaveImagesChange: (images: CapturedImage[]) => void
) => {
  return (selfieImages: CapturedImage[]) => {
    // Add metadata to identify these as selfie images
    const selfieImagesWithMetadata = selfieImages.map(img => ({
      ...img,
      componentType: 'selfie' as const
    }));

    console.log(`🤳 Selfie images changed: ${selfieImagesWithMetadata.length} selfies for task ${taskId}`);

    // Only update the selfie field. This avoids overwriting the latest
    // photo array when async capture/processing callbacks race.
    updateReport(taskId, { selfieImages: selfieImagesWithMetadata });

    // Trigger auto-save with all images (regular + selfie)
    const allImages = [
      ...(report.images || []).map((img: CapturedImage) => ({ ...img, componentType: 'photo' as const })),
      ...selfieImagesWithMetadata
    ];

    console.log(`💾 Triggering auto-save with ${allImages.length} total images (${report.images?.length || 0} photos + ${selfieImagesWithMetadata.length} selfies)`);
    handleAutoSaveImagesChange(allImages);
  };
};

/**
 * Creates auto-save images change handler for AutoSaveFormWrapper
 * This handler is used when restoring draft data from auto-save
 * @param updateReport - Function to update the report in context
 * @param taskId - Task ID
 * @param report - Current report data
 * @param isReadOnly - Whether the form is in read-only mode
 * @returns Auto-save images change handler function
 */
export const createAutoSaveImagesChangeHandler = (
  updateReport: (taskId: string, updates: any) => void,
  taskId: string,
  report: any,
  isReadOnly: boolean
) => {
  return (allImages: CapturedImage[]) => {
    // This callback is used by AutoSaveFormWrapper for auto-save restoration
    // Split images based on componentType metadata
    if (!isReadOnly && report && Array.isArray(allImages)) {
      const selfieImages = allImages.filter(img => img.componentType === 'selfie');
      const regularImages = allImages.filter(img => img.componentType !== 'selfie');

      console.log(`🔄 Auto-save images handler: ${regularImages.length} photos, ${selfieImages.length} selfies for task ${taskId}`);

      updateReport(taskId, {
        ...report,
        images: regularImages,
        selfieImages: selfieImages
      });
    }
  };
};

/**
 * Combines regular and selfie images with proper metadata for AutoSaveFormWrapper
 * @param report - Current report data
 * @returns Combined array of all images with componentType metadata
 */
export const combineImagesForAutoSave = (report: any): CapturedImage[] => {
  return [
    ...(report?.images || []).map((img: CapturedImage) => ({ ...img, componentType: 'photo' as const })),
    ...(report?.selfieImages || []).map((img: CapturedImage) => ({ ...img, componentType: 'selfie' as const }))
  ];
};

/**
 * Type-safe wrapper for form data change handler
 * @param updateReport - Function to update the report in context
 * @param taskId - Task ID
 * @param isReadOnly - Whether the form is in read-only mode
 * @returns Form data change handler function
 */
export const createFormDataChangeHandler = (
  updateReport: (taskId: string, updates: any) => void,
  taskId: string,
  isReadOnly: boolean
) => {
  return (formData: any) => {
    if (!isReadOnly) {
      updateReport(taskId, formData);
    }
  };
};

/**
 * Creates data restored handler for AutoSaveFormWrapper
 * @param updateReport - Function to update the report in context
 * @param taskId - Task ID
 * @param isReadOnly - Whether the form is in read-only mode
 * @returns Data restored handler function
 */
export const createDataRestoredHandler = (
  updateReport: (taskId: string, updates: any) => void,
  taskId: string,
  isReadOnly: boolean
) => {
  return (data: any) => {
    if (!isReadOnly && data.formData) {
      // Restore form data
      const restoredData = { ...data.formData };

      // Also restore images if they exist in the saved data
      if (data.images && Array.isArray(data.images)) {
        // Split images based on componentType metadata
        const selfieImages = data.images.filter((img: any) => img.componentType === 'selfie');
        const regularImages = data.images.filter((img: any) => img.componentType !== 'selfie');

        // Add images to the restored data
        restoredData.images = regularImages;
        restoredData.selfieImages = selfieImages;

        console.log(`🔄 Auto-save restored: ${regularImages.length} photos, ${selfieImages.length} selfies for task ${taskId}`);
      }

      updateReport(taskId, restoredData);
    }
  };
};
