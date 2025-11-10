import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useAuth() {
  const autoLoginAttempted = useRef(false);
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Auto-login if not authenticated
  useEffect(() => {
    if (!isLoading && !user && error && !autoLoginAttempted.current) {
      autoLoginAttempted.current = true;
      console.log("Attempting auto-login...");
      
      apiRequest("POST", "/api/auth/auto-login")
        .then(async (response) => {
          const userData = await response.json();
          console.log("Auto-login successful, setting user data:", userData);
          // Directly set the query data to update immediately
          queryClient.setQueryData(["/api/auth/user"], userData);
        })
        .catch((err) => {
          console.error("Auto-login failed:", err);
          autoLoginAttempted.current = false; // Allow retry on next mount
        });
    }
  }, [isLoading, user, error]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
