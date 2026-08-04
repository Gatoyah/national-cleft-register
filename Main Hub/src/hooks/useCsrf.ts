"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Hook to fetch and manage a CSRF token.
 * Returns the token and a function to get headers with the token included.
 */
export function useCsrf() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/csrf");
      if (res.ok) {
        const data = await res.json();
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    } catch (error) {
      console.error("Failed to fetch CSRF token:", error);
    }
    return null;
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  /**
   * Returns headers object including the CSRF token.
   * Use this when making POST/PUT/DELETE requests.
   */
  const getCsrfHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
    return headers;
  }, [csrfToken]);

  return { csrfToken, getCsrfHeaders, refreshToken: fetchToken };
}
