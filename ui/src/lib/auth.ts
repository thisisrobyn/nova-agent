/**
 * Cognito authentication service.
 *
 * Uses amazon-cognito-identity-js for SRP-based sign-up / sign-in
 * without requiring the full AWS Amplify SDK.
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';

const POOL_ID = import.meta.env.VITE_COGNITO_POOL_ID || 'us-east-1_7JyhPlOoW';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '53vn2vlsppua8ucjlq3ogvv5qp';

const userPool = new CognitoUserPool({
  UserPoolId: POOL_ID,
  ClientId: CLIENT_ID,
});

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

/** Sign up with email + password + display name. */
export function signUp(
  email: string,
  password: string,
  name: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const attrs = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];

    userPool.signUp(email, password, attrs, [], (err) => {
      if (err) {
        reject(new Error(friendlyError(err)));
        return;
      }
      resolve();
    });
  });
}

/** Confirm sign-up with the 6-digit code sent to email. */
export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (err) => {
      if (err) {
        reject(new Error(friendlyError(err)));
        return;
      }
      resolve();
    });
  });
}

/** Resend the confirmation code. */
export function resendConfirmation(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.resendConfirmationCode((err) => {
      if (err) {
        reject(new Error(friendlyError(err)));
        return;
      }
      resolve();
    });
  });
}

/** Sign in with email + password. Returns the authenticated user profile. */
export function signIn(email: string, password: string): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => {
        resolve(parseIdToken(session));
      },
      onFailure: (err) => {
        reject(new Error(friendlyError(err)));
      },
    });
  });
}

/** Sign out the current user. */
export function signOut(): void {
  const user = userPool.getCurrentUser();
  if (user) user.signOut();
}

/** Get the currently authenticated user (from local storage). Returns null if not signed in. */
export function getCurrentUser(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(parseIdToken(session));
    });
  });
}

/** Get the current JWT id token string (for API Authorization header). */
export function getIdToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

/* ── Profile management ───────────────────────────────────── */

/** Update the user's display name. */
export function updateName(newName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) { reject(new Error('Not signed in')); return; }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) { reject(new Error('Session expired')); return; }

      const attr = [new CognitoUserAttribute({ Name: 'name', Value: newName })];
      user.updateAttributes(attr, (updateErr) => {
        if (updateErr) { reject(new Error(friendlyError(updateErr))); return; }
        resolve();
      });
    });
  });
}

/** Update the user's profile picture URL. */
export function updatePicture(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) { reject(new Error('Not signed in')); return; }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) { reject(new Error('Session expired')); return; }

      const attr = [new CognitoUserAttribute({ Name: 'picture', Value: url })];
      user.updateAttributes(attr, (updateErr) => {
        if (updateErr) { reject(new Error(friendlyError(updateErr))); return; }
        resolve();
      });
    });
  });
}

/** Change the user's password. Requires current password. */
export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) { reject(new Error('Not signed in')); return; }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) { reject(new Error('Session expired')); return; }

      user.changePassword(oldPassword, newPassword, (changeErr) => {
        if (changeErr) { reject(new Error(friendlyError(changeErr))); return; }
        resolve();
      });
    });
  });
}

/** Delete the user's account permanently. Requires re-authentication. */
export function deleteAccount(password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) { reject(new Error('Not signed in')); return; }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) { reject(new Error('Session expired')); return; }

      // Re-authenticate before delete
      const email = session.getIdToken().decodePayload()['email'] as string;
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });

      user.authenticateUser(authDetails, {
        onSuccess: () => {
          user.deleteUser((deleteErr) => {
            if (deleteErr) { reject(new Error(friendlyError(deleteErr))); return; }
            resolve();
          });
        },
        onFailure: (authErr) => {
          reject(new Error(friendlyError(authErr)));
        },
      });
    });
  });
}

/* ── Helpers ──────────────────────────────────────────────── */

function parseIdToken(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  return {
    sub: payload['sub'] as string,
    email: payload['email'] as string,
    name: (payload['name'] as string) || (payload['email'] as string),
    picture: payload['picture'] as string | undefined,
  };
}

function friendlyError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err);

  if (msg.includes('User already exists')) return 'An account with this email already exists.';
  if (msg.includes('Incorrect username or password')) return 'Incorrect email or password.';
  if (msg.includes('User is not confirmed')) return 'Please verify your email first.';
  if (msg.includes('Invalid verification code')) return 'Invalid verification code.';
  if (msg.includes('Password did not conform')) {
    return 'Password must be at least 8 characters with uppercase, lowercase, and numbers.';
  }
  if (msg.includes('Invalid email')) return 'Please enter a valid email address.';
  if (msg.includes('Attempt limit exceeded')) return 'Too many attempts. Please try again later.';
  if (msg.includes('Incorrect.*password') || msg.includes('incorrect')) return 'Incorrect password.';

  return msg;
}
