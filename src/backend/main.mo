import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import Expose "mo:caffeineai-oql/Expose";
import Types "types/game";
import GameApi "mixins/game-api";
import ApiDocMixin "mixins/api-doc";

actor {
  let accessControlState : AccessControl.AccessControlState;
  let gameState : Types.GameState;

  include MixinAuthorization(accessControlState, null);
  include GameApi(gameState);
  include ApiDocMixin();
  include Expose({ entities = [] });
};
