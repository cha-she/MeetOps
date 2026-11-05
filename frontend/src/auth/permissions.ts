import type { Decision, Meeting, Risk, Task, User } from "../types";

// Mirrors backend/app/security.py so the UI only offers actions the server will accept.
// The server always checks again; these helpers just hide controls that would be refused.

const sameDept = (user: User, deptId: number | undefined | null) => !!user.department && user.department.id === deptId;

export function canEditTask(user: User, task: Task): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return sameDept(user, task.department?.id) || sameDept(user, task.owner?.department?.id);
  return task.owner?.id === user.id;
}

// Who does a task and by when: an administrator or the department's manager (backend: can_assign_task).
export function canAssignTask(user: User, task: Task): boolean {
  return (user.role === "admin" || user.role === "manager") && canEditTask(user, task);
}

export function canEditMeetingItems(user: User, meeting: Meeting): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return sameDept(user, meeting.department?.id);
  return meeting.uploadedBy?.id === user.id || meeting.participants.some((p) => p.id === user.id);
}

// Register lists do not carry the participant list; managers and admins are decided here,
// members get the controls and the server decides (a refusal shows a message).
export function mayEditItem(user: User, item: Decision | Risk): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return sameDept(user, item.department?.id);
  return true;
}

export function canDeleteMeeting(user: User, meeting: Meeting): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return sameDept(user, meeting.department?.id);
  return meeting.uploadedBy?.id === user.id;
}
