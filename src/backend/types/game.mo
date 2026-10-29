import Common "../types/common";

module {
  /// Shared, session-scoped high score state for the endless runner.
  /// Not tied to a signed-in user; shared across all callers of the session.
  public type GameState = {
    var sessionHighScore : Common.Distance;
  };
};
