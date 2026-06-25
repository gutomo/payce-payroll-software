/** Shared state shape for the auth forms (`useActionState`). Kept in its own module so both the
 *  server actions and the client form components can import it without crossing the server boundary. */
export interface AuthFormState {
  error?: string;
}

export const INITIAL_AUTH_STATE: AuthFormState = {};
