import { CameraService } from '../services/CameraService';

export const CapturePhotoUseCase = {
  async execute(
    sourcePath: string,
    taskId: string,
    componentType: 'photo' | 'selfie' = 'photo',
    options?: Parameters<typeof CameraService.savePhoto>[3],
  ) {
    return CameraService.savePhoto(sourcePath, taskId, componentType, options);
  },
};
