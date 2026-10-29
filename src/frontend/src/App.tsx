import { GameCanvas } from "@/components/game/GameCanvas";

export default function App() {
  return (
    <main className="fixed inset-0 flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-background">
      {/* Sunset-glow framing so the chrome reads like an arcade cabinet. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-glow" />
      <div className="cabinet-frame relative h-full w-full overflow-hidden rounded-[1.25rem]">
        <GameCanvas />
      </div>
    </main>
  );
}
