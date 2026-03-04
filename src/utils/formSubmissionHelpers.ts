import { TaskStatus } from '../types';

/**
 * Handle successful verification form submission
 * This utility provides consistent post-submission behavior across all verification forms:
 * 1. Shows success message to user
 * 2. Refreshes case list from backend (backend automatically updates case status based on all tasks)
 * 3. Navigates to appropriate screen based on case completion status
 * 4. LOCKS the task locally immediately to prevent re-submission
 *
 * @param taskId - The ID of the task that was submitted
 * @param fetchTasks - Function to refresh case list from "./context/TaskContext"
 * @param navigate - React Router navigate function
 * @param setSubmissionSuccess - State setter for success message
 * @param updateTaskStatus - Function to update local task status (for immediate locking)
 */
export const handleSuccessfulSubmission = async (
  taskId: string,
  fetchTasks: () => void,
  navigate: (path: string) => void,
  setSubmissionSuccess: (success: boolean) => void,
  updateTaskStatus?: (taskId: string, status: TaskStatus) => Promise<void>
): Promise<void> => {
  try {
    console.log(`✅ Handling successful submission for task ${taskId}`);

    // CRITICAL: Immediately lock the task locally
    // This prevents the user from going back and editing/resubmitting
    if (updateTaskStatus) {
      console.log(`🔒 Locking task ${taskId} locally as COMPLETED`);
      // We don't await this to avoid blocking UI feedback, but it runs immediately
      updateTaskStatus(taskId, TaskStatus.Completed).catch(err => 
        console.error(`❌ Failed to lock task ${taskId}:`, err)
      );
    }

    // Show success message
    setSubmissionSuccess(true);

    // Refresh case list to get updated data from backend
    // The backend will automatically update case status based on all verification tasks
    fetchTasks();

    // Navigate to in-progress cases screen after a brief delay to show success message
    // The case will appear in completed cases only when ALL tasks are done (backend handles this)
    setTimeout(() => {
      navigate('/cases/in-progress');
    }, 1500);
  } catch (error) {
    console.error('❌ Error in post-submission handling:', error);
    // Still navigate even if there's an error, as the submission was successful
    setTimeout(() => {
      navigate('/cases/in-progress');
    }, 1500);
  }
};

