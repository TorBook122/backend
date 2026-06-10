export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export type AuthUser = {
  id: string;
  name: string;
  role: string;
  onboardingCompletedAt: string | null;
};

export type AuthTokens = {
  accessToken: string;
  user: AuthUser;
};
