import Common "../types/common";
import Types "../types/game";
import GameLib "../lib/game";

mixin (state : Types.GameState) {
  /// Returns the current session high score.
  public query func getSessionHighScore() : async Common.Distance {
    GameLib.getSessionHighScore(state);
  };

  /// Records a finished run's distance and returns the resulting session high score.
  public func submitRun(distance : Common.Distance) : async Common.Distance {
    GameLib.submitRun(state, distance);
  };
};
