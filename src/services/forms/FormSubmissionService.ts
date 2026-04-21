import { AttachmentRepository } from '../../repositories/AttachmentRepository';
import { isCountableAttachment } from '../../utils/attachmentCount';
import { validateTemplateRequiredFields } from './FormValidationEngine';
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
    template,
    formValues,
    selectedOutcome,
    taskFormTypeKey,
    submitTaskForm,
  }: FormSubmissionParams): Promise<void> {
    // Pre-submit validation: check all required fields against template
    // before queuing to avoid wasting sync bandwidth on invalid forms.
    if (template) {
      const { isValid, missingFields } = validateTemplateRequiredFields(
        template,
        formValues,
      );
      if (!isValid) {
        throw new Error(
          `Please fill in all required fields before submitting:\n${missingFields.join(
            ', ',
          )}`,
        );
      }
    }

    // H3/M4 (audit 2026-04-21): only count photos that are actually
    // uploadable toward the submission minimum. ABANDONED / SKIPPED
    // are excluded. Shared helper `isCountableAttachment` keeps this
    // in sync with the PhotoGallery display count.
    const attachments = await AttachmentRepository.listForTask(task.id);
    let photoCount = 0;
    let selfieCount = 0;
    attachments.forEach(row => {
      if (!isCountableAttachment(row)) {
        return;
      }
      const raw = row as unknown as Record<string, unknown>;
      const ct = raw.componentType ?? row.componentType;
      if (ct === 'photo') photoCount += 1;
      if (ct === 'selfie') selfieCount += 1;
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
      },
      verificationOutcome: selectedOutcome,
    });
  }
}

export const FormSubmissionService = new FormSubmissionServiceClass();
export default FormSubmissionService;
