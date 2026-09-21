const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailLike(value: string): boolean {
  return value.includes("@");
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function validateIdentifier(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Enter your username or email address.";
  }

  if (isEmailLike(trimmed) && !isValidEmail(trimmed)) {
    return "Enter a valid email address.";
  }

  if (!isEmailLike(trimmed) && trimmed.length < 3) {
    return "Username must be at least 3 characters.";
  }

  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) {
    return "Enter your password.";
  }

  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return null;
}

export function validateFullName(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Enter your full name.";
  }

  if (trimmed.length < 2) {
    return "Name must be at least 2 characters.";
  }

  return null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Enter your email address.";
  }

  if (!isValidEmail(trimmed)) {
    return "Enter a valid email address.";
  }

  return null;
}

export function validateNewPassword(value: string): string | null {
  if (!value) {
    return "Create a password.";
  }

  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "Password must contain both letters and numbers.";
  }

  return null;
}

export function validateConfirmPassword(
  password: string,
  confirmation: string,
): string | null {
  if (!confirmation) {
    return "Confirm your password.";
  }

  if (password !== confirmation) {
    return "Passwords do not match.";
  }

  return null;
}
