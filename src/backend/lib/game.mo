import Common "../types/common";
import Types "../types/game";

module {
  /// Returns the current session high score.
  public func getSessionHighScore(state : Types.GameState) : Common.Distance {
    state.sessionHighScore;
  };

  /// Records a finished run's distance and returns the resulting session high score.
  /// The session high score only ever increases; a lower run leaves it unchanged.
  public func submitRun(state : Types.GameState, distance : Common.Distance) : Common.Distance {
    if (distance > state.sessionHighScore) {
      state.sessionHighScore := distance;
    };
    state.sessionHighScore;
  };
};
