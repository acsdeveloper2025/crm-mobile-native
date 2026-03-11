import { AttachmentRepository } from '../../repositories/AttachmentRepository';
import type { FormTemplate } from '../../types/api';
import type { LocalTask } from '../../types/mobile';
import type { FormTypeKey } from '../../utils/formTypeKey';

export interface FormSubmissionParams {
  task: LocalTask;
  template: FormTemplate;
  formValues: Record<string, unknown>;
  selectedOutcome: string | null;
  taskFormTypeKey: FormTypeKey | null;
  submitTaskForm: (input: {
    taskId: string;
    formType: string;
    formData: Record<string, unknown>;
    verificationOutcome?: string | null;
  }) => Promise<void>;
}

class FormSubmissionServiceClass {
  async submitVerificationForm({
    task,
    formValues,
    selectedOutcome,
    taskFormTypeKey,
    submitTaskForm,
  }: FormSubmissionParams): Promise<void> {
    const attachments = await AttachmentRepository.listForTask(task.id);
    let photoCount = 0;
    let selfieCount = 0;
    attachments.forEach(row => {
      if (row.componentType === 'photo') photoCount += 1;
      if (row.componentType === 'selfie') selfieCount += 1;
    });

    if (photoCount < 5 || selfieCount < 1) {
      throw new Error(
        `You must capture at least 5 location photos (Current: ${photoCount}) and 1 Selfie (Current: ${selfieCount}) before submitting.`,
      );
    }

    const remarks =
      String(formValues.remarks || '').trim() ||
      String(formValues.otherObservation || '').trim();

    await submitTaskForm({
      taskId: task.id,
      formType: taskFormTypeKey || 'DEFAULT',
      formData: {
        ...formValues,
        remarks,
        submittedAt: new Date().toISOString(),
      },
      verificationOutcome: selectedOutcome,
    });
  }
}

export const FormSubmissionService = new FormSubmissionServiceClass();
export default FormSubmissionService;
