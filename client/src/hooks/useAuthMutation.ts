import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

interface AuthMutationOptions<TData, TVariables> extends Omit<UseMutationOptions<TData, Error, TVariables>, "onError"> {
  errorMessage?: string;
  onError?: (error: Error) => void;
}

export function useAuthMutation<TData = unknown, TVariables = void>(
  options: AuthMutationOptions<TData, TVariables>
) {
  const { toast } = useToast();
  const { errorMessage = "An error occurred", onError: userOnError, ...rest } = options;

  return useMutation<TData, Error, TVariables>({
    ...rest,
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      if (userOnError) {
        userOnError(error);
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });
}
