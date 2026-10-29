import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Reads the current session high score from the backend. */
export function useSessionHighScore() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["sessionHighScore"],
    queryFn: async () => {
      if (!actor) return 0n;
      return actor.getSessionHighScore();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Records a finished run and returns the resulting session high score. */
export function useSubmitRun() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (distance: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.submitRun(distance);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessionHighScore"] });
    },
  });
}
