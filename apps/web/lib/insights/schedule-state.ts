/** Shared `useActionState` shape for the "schedule a report" form. Its own module so the server
 *  action and the client component can both import it without crossing the server boundary. */
export interface ScheduleFormState {
  /** Set on a successful create so the form can reset and confirm. */
  ok?: boolean;
  error?: string;
}

export const INITIAL_SCHEDULE_STATE: ScheduleFormState = {};
