export type FormType = string;

export const getTaskFormType = (_task: any): FormType => 'generic';

export const getTaskStatusLabel = (status?: string): string => status || 'Unknown';
