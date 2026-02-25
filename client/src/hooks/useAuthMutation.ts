import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

interface AuthMutationOptions<TData, TVariables, TContext = unknown> extends Omit<UseMutationOptions<TData, Error, TVariables, TContext>, "onError"> {
  errorMessage?: string;
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void;
}

export function useAuthMutation<TData = unknown, TVariables = void, TContext = unknown>(
  options: AuthMutationOptions<TData, TVariables, TContext>
) {
  const { toast } = useToast();
  const { errorMessage = "An error occurred", onError: userOnError, ...rest } = options;

  return useMutation<TData, Error, TVariables, TContext>({
    ...rest,
    onError: (error: Error, variables: TVariables, context: TContext | undefined) => {
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
        userOnError(error, variables, context);
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
