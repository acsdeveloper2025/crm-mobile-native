export type FormType = string;

export const getTaskFormType = (_task: unknown): FormType => 'generic';

export const getTaskStatusLabel = (status?: string): string => status || 'Unknown';
